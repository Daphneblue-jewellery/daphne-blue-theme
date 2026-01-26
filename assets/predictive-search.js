import { Component } from '@theme/component';
import { debounce, onAnimationEnd, prefersReducedMotion, onDocumentLoaded } from '@theme/utilities';
import { sectionRenderer } from '@theme/section-renderer';
import { morph } from '@theme/morph';
import { RecentlyViewed } from '@theme/recently-viewed-products';
import { DialogCloseEvent, DialogComponent } from '@theme/dialog';

/**
 * A custom element that allows the user to search for resources available on the store.
 *
 * @typedef {object} Refs
 * @property {HTMLInputElement} searchInput - The search input element.
 * @property {HTMLElement} predictiveSearchResults - The predictive search results container.
 * @property {HTMLElement} resetButton - The reset button element.
 * @property {HTMLElement[]} [resultsItems] - The search results items elements.
 * @property {HTMLElement} [recentlyViewedWrapper] - The recently viewed products wrapper.
 * @property {HTMLElement[]} [recentlyViewedTitle] - The recently viewed title elements.
 * @property {HTMLElement[]} [recentlyViewedItems] - The recently viewed product items.
 * @extends {Component<Refs>}
 */
class PredictiveSearchComponent extends Component {
  requiredRefs = ['searchInput', 'predictiveSearchResults', 'resetButton'];

  #controller = new AbortController();

  /**
   * @type {AbortController | null}
   */
  #activeFetch = null;

  /**
   * @type {ReturnType<typeof setTimeout> | null}
   */
  #placeholderTimeout = null;

  #placeholderIndex = 0;
  #placeholderCharIndex = 0;
  #placeholderIsDeleting = false;
  #placeholderCategories = [];
  #placeholderPrefix = '';
  #placeholderOriginal = '';
  #dropdownOpen = false;

  /**
   * Get the dialog component.
   * @returns {DialogComponent | null} The dialog component.
   */
  get dialog() {
    return this.closest('dialog-component');
  }

  connectedCallback() {
    super.connectedCallback();

    const { dialog } = this;
    const { signal } = this.#controller;

    if (this.refs.searchInput.value.length > 0) {
      this.#showResetButton();
    }

    this.#setDropdownState(false);
    this.refs.searchInput.addEventListener('focus', this.#openDropdown, { signal });
    this.refs.searchInput.addEventListener('input', this.#openDropdown, { signal });
    this.addEventListener('focusout', this.#handleFocusOut, { signal });
    document.addEventListener('click', this.#handleOutsideClick, { signal });
    if (document.activeElement === this.refs.searchInput) {
      this.#openDropdown();
    }

    if (dialog) {
      document.addEventListener('keydown', this.#handleKeyboardShortcut, { signal });
      dialog.addEventListener(DialogCloseEvent.eventName, this.#handleDialogClose, { signal });

      this.addEventListener('click', this.#handleModalClick, { signal });
    }

    this.#setupPlaceholderAnimation(signal);
    this.addEventListener('click', this.#handleCategoryClick, { signal });
    this.addEventListener('focusin', this.#handleCategoryFocus, { signal });

    onDocumentLoaded(() => {
      this.resetSearch(false); // Pass false to avoid focusing the input
    });
  }

  /**
   * Handles clicks within the predictive search modal to maintain focus on the input
   * @param {MouseEvent} event - The mouse event
   */
  #handleModalClick = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const isInteractiveElement =
      target instanceof HTMLButtonElement ||
      target instanceof HTMLAnchorElement ||
      target instanceof HTMLInputElement ||
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input');

    if (!isInteractiveElement && this.refs.searchInput) {
      this.refs.searchInput.focus();
    }
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller.abort();
    this.#stopPlaceholderAnimation();
  }

  /**
   * Handles the CMD+K key combination.
   * @param {KeyboardEvent} event - The keyboard event.
   */
  #handleKeyboardShortcut = (event) => {
    if (event.metaKey && event.key === 'k') {
      this.dialog?.toggleDialog();
    }
  };

  /**
   * Handles the dialog close event.
   */
  #handleDialogClose = () => {
    this.#closeDropdown();
    this.#resetSearch();
  };

  /**
   * Handle category link clicks for motion feedback.
   * @param {MouseEvent} event
   */
  #handleCategoryClick = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const link = target.closest('[data-search-category-link]');
    if (!(link instanceof HTMLElement)) return;
    this.#setActiveCategory(link);
    this.#closeDropdown();
  };

  /**
   * Handle category link focus for keyboard selection.
   * @param {FocusEvent} event
   */
  #handleCategoryFocus = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const link = target.closest('[data-search-category-link]');
    if (!(link instanceof HTMLElement)) return;
    this.#setActiveCategory(link);
  };

  /**
   * Set the active category state for motion styling.
   * @param {HTMLElement} link
   */
  #setActiveCategory(link) {
    const items = Array.from(this.querySelectorAll('.predictive-search-categories__item'));
    items.forEach((item) => item.classList.remove('is-active'));

    const item = link.closest('.predictive-search-categories__item');
    if (item) {
      item.classList.add('is-active');
    }
  }

  #setDropdownState(open) {
    this.#dropdownOpen = open;
    this.classList.toggle('predictive-search--open', open);

    const dropdown = this.querySelector('.predictive-search-dropdown');
    if (dropdown) {
      dropdown.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    if (this.refs.searchInput) {
      this.refs.searchInput.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  #openDropdown = () => {
    this.#setDropdownState(true);
  };

  #closeDropdown = () => {
    this.#setDropdownState(false);
  };

  #syncDropdownState = () => {
    this.#setDropdownState(this.#dropdownOpen);
  };

  #handleOutsideClick = (event) => {
    if (!this.#dropdownOpen) return;
    const target = /** @type {HTMLElement} */ (event.target);
    if (target && !this.contains(target)) {
      this.#closeDropdown();
      this.refs.searchInput.blur();
    }
  };

  #handleFocusOut = (event) => {
    const nextTarget = /** @type {HTMLElement | null} */ (event.relatedTarget);
    if (nextTarget && this.contains(nextTarget)) return;
    this.#closeDropdown();
  };

  get #allResultsItems() {
    const containers = Array.from(
      this.querySelectorAll(
        '.predictive-search-results__wrapper-queries, ' +
          '.predictive-search-results__wrapper-products, ' +
          '.predictive-search-results__list'
      )
    );

    const allItems = containers
      .flatMap((container) => {
        if (container.classList.contains('predictive-search-results__wrapper-products')) {
          return Array.from(container.querySelectorAll('.predictive-search-results__card'));
        }
        return Array.from(container.querySelectorAll('[ref="resultsItems[]"], .predictive-search-results__card'));
      })
      .filter((item) => item instanceof HTMLElement);

    return /** @type {HTMLElement[]} */ (allItems);
  }

  /**
   * Track whether the last interaction was keyboard-based
   * @type {boolean}
   */
  #isKeyboardNavigation = false;

  get #currentIndex() {
    return this.#allResultsItems?.findIndex((item) => item.getAttribute('aria-selected') === 'true') ?? -1;
  }

  set #currentIndex(index) {
    if (!this.#allResultsItems?.length) return;

    this.#allResultsItems.forEach((item) => {
      item.classList.remove('keyboard-focus');
    });

    for (const [itemIndex, item] of this.#allResultsItems.entries()) {
      if (itemIndex === index) {
        item.setAttribute('aria-selected', 'true');

        if (this.#isKeyboardNavigation) {
          item.classList.add('keyboard-focus');
        }
        item.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth', block: 'nearest' });
      } else {
        item.removeAttribute('aria-selected');
      }
    }
    this.refs.searchInput.focus();
  }

  get #currentItem() {
    return this.#allResultsItems?.[this.#currentIndex];
  }

  /**
   * Navigate through the predictive search results using arrow keys or close them with the Escape key.
   * @param {KeyboardEvent} event - The keyboard event.
   */
  onSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      this.#closeDropdown();
      this.#resetSearch();
      this.refs.searchInput.blur();
      return;
    }

    if (!this.#allResultsItems?.length || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      return;
    }

    const currentIndex = this.#currentIndex;
    const totalItems = this.#allResultsItems.length;

    switch (event.key) {
      case 'ArrowDown':
        this.#isKeyboardNavigation = true;
        event.preventDefault();
        this.#currentIndex = currentIndex < totalItems - 1 ? currentIndex + 1 : 0;
        break;

      case 'Tab':
        if (event.shiftKey) {
          this.#isKeyboardNavigation = true;
          event.preventDefault();
          this.#currentIndex = currentIndex > 0 ? currentIndex - 1 : totalItems - 1;
        } else {
          this.#isKeyboardNavigation = true;
          event.preventDefault();
          this.#currentIndex = currentIndex < totalItems - 1 ? currentIndex + 1 : 0;
        }
        break;

      case 'ArrowUp':
        this.#isKeyboardNavigation = true;
        event.preventDefault();
        this.#currentIndex = currentIndex > 0 ? currentIndex - 1 : totalItems - 1;
        break;

      case 'Enter': {
        const singleResultContainer = this.refs.predictiveSearchResults.querySelector('[data-single-result-url]');
        if (singleResultContainer instanceof HTMLElement && singleResultContainer.dataset.singleResultUrl) {
          event.preventDefault();
          window.location.href = singleResultContainer.dataset.singleResultUrl;
          return;
        }

        if (this.#currentIndex >= 0) {
          event.preventDefault();
          this.#currentItem?.querySelector('a')?.click();
        } else {
          const searchUrl = new URL(Theme.routes.search_url, location.origin);
          searchUrl.searchParams.set('q', this.refs.searchInput.value);
          window.location.href = searchUrl.toString();
        }
        break;
      }
    }
  };

  /**
   * Clears the recently viewed products.
   * @param {Event} event - The event.
   */
  clearRecentlyViewedProducts(event) {
    event.stopPropagation();

    RecentlyViewed.clearProducts();

    const { recentlyViewedItems, recentlyViewedTitle, recentlyViewedWrapper } = this.refs;

    const allRecentlyViewedElements = [...(recentlyViewedItems || []), ...(recentlyViewedTitle || [])];

    if (allRecentlyViewedElements.length === 0) {
      return;
    }

    if (recentlyViewedWrapper) {
      recentlyViewedWrapper.classList.add('removing');

      onAnimationEnd(recentlyViewedWrapper, () => {
        recentlyViewedWrapper.remove();
      });
    }
  }

  /**
   * Reset the search state.
   * @param {boolean} [keepFocus=true] - Whether to keep focus on input after reset
   */
  resetSearch = debounce((keepFocus = true) => {
    if (keepFocus) {
      this.refs.searchInput.focus();
    }
    this.#resetSearch();
  }, 100);

  /**
   * Debounce the search handler to fetch and display search results based on the input value.
   * Reset the current selection index and close results if the search term is empty.
   */
  search = debounce((event) => {
    // If the input is not a text input (like using the Escape key), don't search
    if (!event.inputType) return;

    const searchTerm = this.refs.searchInput.value.trim();
    this.#currentIndex = -1;

    if (!searchTerm.length) {
      this.#resetSearch();
      return;
    }

    this.#showResetButton();
    this.#getSearchResults(searchTerm);
  }, 200);

  /**
   * Resets scroll positions for search results containers
   */
  #resetScrollPositions() {
    requestAnimationFrame(() => {
      const resultsInner = this.refs.predictiveSearchResults.querySelector('.predictive-search-results__inner');
      if (resultsInner instanceof HTMLElement) {
        resultsInner.scrollTop = 0;
      }

      const formContent = this.querySelector('.predictive-search-form__content');
      if (formContent instanceof HTMLElement) {
        formContent.scrollTop = 0;
      }
    });
  }

  /**
   * Fetch search results using the section renderer and update the results container.
   * @param {string} searchTerm - The term to search for
   */
  async #getSearchResults(searchTerm) {
    if (!this.dataset.sectionId) return;

    const url = new URL(Theme.routes.predictive_search_url, location.origin);
    url.searchParams.set('q', searchTerm);
    url.searchParams.set('resources[limit_scope]', 'each');

    const { predictiveSearchResults } = this.refs;

    const abortController = this.#createAbortController();

    sectionRenderer
      .getSectionHTML(this.dataset.sectionId, false, url)
      .then((resultsMarkup) => {
        if (!resultsMarkup) return;

        if (abortController.signal.aborted) return;

        morph(predictiveSearchResults, resultsMarkup);
        this.#syncDropdownState();

        this.#resetScrollPositions();
      })
      .catch((error) => {
        if (abortController.signal.aborted) return;
        throw error;
      });
  }

  /**
   * Fetch the markup for the recently viewed products.
   * @returns {Promise<string | null>} The markup for the recently viewed products.
   */
  async #getRecentlyViewedProductsMarkup() {
    if (!this.dataset.sectionId) return null;

    const viewedProducts = RecentlyViewed.getProducts();
    if (viewedProducts.length === 0) return null;

    const url = new URL(Theme.routes.search_url, location.origin);
    url.searchParams.set('q', viewedProducts.map(/** @param {string} id */ (id) => `id:${id}`).join(' OR '));
    url.searchParams.set('resources[type]', 'product');

    return sectionRenderer.getSectionHTML(this.dataset.sectionId, false, url);
  }

  #hideResetButton() {
    const { resetButton } = this.refs;

    resetButton.hidden = true;
  }

  #showResetButton() {
    const { resetButton } = this.refs;

    resetButton.hidden = false;
  }

  #createAbortController() {
    const abortController = new AbortController();
    if (this.#activeFetch) {
      this.#activeFetch.abort();
    }
    this.#activeFetch = abortController;
    return abortController;
  }

  #resetSearch = async () => {
    const { predictiveSearchResults, searchInput } = this.refs;
    const emptySectionId = 'predictive-search-empty';

    this.#currentIndex = -1;
    searchInput.value = '';
    this.#hideResetButton();

    const abortController = this.#createAbortController();
    const url = new URL(window.location.href);
    url.searchParams.delete('page');

    const emptySectionMarkup = await sectionRenderer.getSectionHTML(emptySectionId, false, url);
    const parsedEmptySectionMarkup = new DOMParser()
      .parseFromString(emptySectionMarkup, 'text/html')
      .querySelector('.predictive-search-empty-section');

    if (!parsedEmptySectionMarkup) throw new Error('No empty section markup found');

    /** This needs to be awaited and not .then so the DOM is already morphed
     * when #closeResults is called and therefore the height is animated */
    const viewedProducts = RecentlyViewed.getProducts();

    if (viewedProducts.length > 0) {
      const recentlyViewedMarkup = await this.#getRecentlyViewedProductsMarkup();
      if (!recentlyViewedMarkup) return;

      const parsedRecentlyViewedMarkup = new DOMParser().parseFromString(recentlyViewedMarkup, 'text/html');
      const recentlyViewedProductsHtml = parsedRecentlyViewedMarkup.getElementById('predictive-search-products');
      if (recentlyViewedProductsHtml) {
        for (const child of recentlyViewedProductsHtml.children) {
          if (child instanceof HTMLElement) {
            child.setAttribute('ref', 'recentlyViewedWrapper');
          }
        }

        const collectionElement = parsedEmptySectionMarkup.querySelector('#predictive-search-products');
        if (collectionElement) {
          collectionElement.prepend(...recentlyViewedProductsHtml.children);
        }
      }
    }

    if (abortController.signal.aborted) return;

    morph(predictiveSearchResults, parsedEmptySectionMarkup);
    this.#syncDropdownState();
    this.#resetScrollPositions();
    this.#resetPlaceholderAnimation();
    this.#resumePlaceholderAnimation();
  };

  /**
   * Build the placeholder string from the prefix and typed text.
   * @param {string} typedText
   * @returns {string}
   */
  #buildPlaceholder(typedText = '') {
    const prefix = this.#placeholderPrefix;
    const spacer = prefix && !prefix.endsWith(' ') ? ' ' : '';
    return `${prefix}${spacer}${typedText}`.trimEnd();
  }

  /**
   * Get category names for placeholder animation.
   * @returns {string[]}
   */
  #getPlaceholderCategories() {
    if (this.dataset.placeholderCategories) {
      try {
        const parsed = JSON.parse(this.dataset.placeholderCategories);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
      } catch (error) {
        // Ignore invalid JSON to fall back to DOM lookup.
      }
    }

    return Array.from(this.querySelectorAll('[data-search-category-link]'))
      .map((element) => element.textContent?.trim() || '')
      .filter(Boolean);
  }

  /**
   * Initialize the placeholder animation and listeners.
   * @param {AbortSignal} signal
   */
  #setupPlaceholderAnimation(signal) {
    this.#placeholderOriginal = this.refs.searchInput.getAttribute('placeholder') ?? '';
    this.#placeholderPrefix = (this.dataset.placeholderPrefix || this.#placeholderOriginal || '').trim();
    this.#placeholderCategories = this.#getPlaceholderCategories();

    if (!this.#placeholderCategories.length) return;

    if (prefersReducedMotion() || this.#placeholderCategories.length === 1) {
      this.refs.searchInput.placeholder = this.#buildPlaceholder(this.#placeholderCategories[0] || '');
      return;
    }

    this.refs.searchInput.addEventListener('focus', this.#pausePlaceholderAnimation, { signal });
    this.refs.searchInput.addEventListener('blur', this.#resumePlaceholderAnimation, { signal });
    this.refs.searchInput.addEventListener('input', this.#handlePlaceholderInput, { signal });
    this.#resumePlaceholderAnimation();
  }

  #shouldAnimatePlaceholder() {
    return (
      this.refs.searchInput.value.length === 0 &&
      document.activeElement !== this.refs.searchInput &&
      this.#placeholderCategories.length > 0
    );
  }

  #handlePlaceholderInput = () => {
    if (this.refs.searchInput.value.length > 0) {
      this.#pausePlaceholderAnimation();
      return;
    }
    this.#resumePlaceholderAnimation();
  };

  #resumePlaceholderAnimation = () => {
    if (prefersReducedMotion()) return;
    if (!this.#shouldAnimatePlaceholder()) {
      this.#pausePlaceholderAnimation();
      return;
    }
    if (this.#placeholderTimeout) return;
    this.#advancePlaceholder();
  };

  #pausePlaceholderAnimation = () => {
    this.#stopPlaceholderAnimation();
    if (this.refs.searchInput.value.length === 0) {
      this.refs.searchInput.placeholder = this.#placeholderOriginal;
    }
  };

  #resetPlaceholderAnimation() {
    this.#placeholderIndex = 0;
    this.#placeholderCharIndex = 0;
    this.#placeholderIsDeleting = false;
  }

  #stopPlaceholderAnimation() {
    if (this.#placeholderTimeout) {
      clearTimeout(this.#placeholderTimeout);
      this.#placeholderTimeout = null;
    }
  }

  #advancePlaceholder = () => {
    if (!this.#shouldAnimatePlaceholder()) {
      this.#pausePlaceholderAnimation();
      return;
    }

    const category = this.#placeholderCategories[this.#placeholderIndex] || '';
    let delay = 85;

    if (this.#placeholderIsDeleting) {
      this.#placeholderCharIndex -= 1;
      delay = 40;

      if (this.#placeholderCharIndex <= 0) {
        this.#placeholderIsDeleting = false;
        this.#placeholderIndex = (this.#placeholderIndex + 1) % this.#placeholderCategories.length;
        delay = 300;
      }
    } else {
      this.#placeholderCharIndex += 1;
      if (this.#placeholderCharIndex >= category.length) {
        this.#placeholderIsDeleting = true;
        delay = 1200;
      }
    }

    const visibleText = category.slice(0, Math.max(this.#placeholderCharIndex, 0));
    this.refs.searchInput.placeholder = this.#buildPlaceholder(visibleText);
    this.#placeholderTimeout = window.setTimeout(this.#advancePlaceholder, delay);
  };
}

if (!customElements.get('predictive-search-component')) {
  customElements.define('predictive-search-component', PredictiveSearchComponent);
}
