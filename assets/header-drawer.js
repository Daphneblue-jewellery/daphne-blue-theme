import { Component } from '@theme/component';
import { trapFocus, removeTrapFocus } from '@theme/focus';
import { onAnimationEnd } from '@theme/utilities';

/**
 * A custom element that manages the main menu drawer.
 *
 * @typedef {object} Refs
 * @property {HTMLDetailsElement} details - The details element.
 *
 * @extends {Component<Refs>}
 */
class HeaderDrawer extends Component {
  requiredRefs = ['details'];

  #drawerSearchInput = null;
  #drawerSuggestions = null;
  #drawerMenuSections = [];
  #forcedDrawerContainer = null;

  connectedCallback() {
    super.connectedCallback();

    this.#drawerSearchInput = this.querySelector('[data-drawer-search-input]');
    this.#drawerSuggestions = this.querySelector('[data-drawer-search-suggestions]');
    this.#drawerMenuSections = Array.from(
      this.querySelectorAll(
        '.menu-drawer__navigation, .menu-drawer__utility-links, .menu-drawer__featured-content'
      )
    );
    this.#setupDrawerSearch();

    this.addEventListener('keyup', this.#onKeyUp);
    this.#setupAnimatedElementListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('keyup', this.#onKeyUp);
  }

  /**
   * Close the main menu drawer when the Escape key is pressed
   * @param {KeyboardEvent} event
   */
  #onKeyUp = (event) => {
    if (event.key !== 'Escape') return;

    this.#close(this.#getDetailsElement(event));
  };

  /**
   * @returns {boolean} Whether the main menu drawer is open
   */
  get isOpen() {
    return this.refs.details.hasAttribute('open');
  }

  /**
   * Get the closest details element to the event target
   * @param {Event | undefined} event
   * @returns {HTMLDetailsElement}
   */
  #getDetailsElement(event) {
    if (!(event?.target instanceof Element)) return this.refs.details;

    return event.target.closest('details') ?? this.refs.details;
  }

  /**
   * Toggle the main menu drawer
   */
  toggle(event) {
    return this.isOpen ? this.close() : this.open(event);
  }

  /**
   * Open the closest drawer or the main menu drawer
   * @param {Event} [event]
   */
  open(event) {
    const details = this.#getDetailsElement(event);
    const summary = details.querySelector('summary');

    if (!summary) return;

    this.#setDrawerMode(event, details);
    if (details === this.refs.details && this.#drawerSearchInput && this.#drawerSuggestions) {
      this.#activateSearchMode();
    }
    summary.setAttribute('aria-expanded', 'true');

    this.preventInitialAccordionAnimations(details);
    requestAnimationFrame(() => {
      details.classList.add('menu-open');
      setTimeout(() => {
        trapFocus(details);
        if (details === this.refs.details && this.dataset.drawerMode === 'search') {
          this.#showDrawerSuggestions();
        }
      }, 0);
    });
  }

  openSearch(event) {
    this.#ensureDrawerVisibleForSearch();
    this.#activateSearchMode();
    this.open(event);
  }

  /**
   * Go back or close the main menu drawer
   * @param {Event} [event]
   */
  back(event) {
    this.#close(this.#getDetailsElement(event));
  }

  /**
   * Close the main menu drawer
   */
  close() {
    this.#close(this.refs.details);
  }

  /**
   * Close the closest menu or submenu that is open
   *
   * @param {HTMLDetailsElement} details
   */
  #close(details) {
    const summary = details.querySelector('summary');

    if (!summary) return;

    const isMainDrawer = details === this.refs.details;

    summary.setAttribute('aria-expanded', 'false');
    details.classList.remove('menu-open');
    if (isMainDrawer) {
      this.#resetDrawerSearch();
    }

    onAnimationEnd(details, () => {
      reset(details);
      if (isMainDrawer) {
        removeTrapFocus();
        const openDetails = this.querySelectorAll('details[open]:not(accordion-custom > details)');
        openDetails.forEach(reset);
        this.#restoreDrawerVisibility();
      } else {
        setTimeout(() => {
          trapFocus(this.refs.details);
        }, 0);
      }
    });
  }

  #setDrawerMode(event, details) {
    if (details !== this.refs.details) return;

    const target = event?.target instanceof Element ? event.target : null;
    const modeTrigger = target?.closest('[data-drawer-mode]');
    if (modeTrigger && modeTrigger instanceof HTMLElement && modeTrigger.dataset.drawerMode) {
      this.dataset.drawerMode = modeTrigger.dataset.drawerMode;
      return;
    }

    if (target?.closest('.header__icon--summary')) {
      this.dataset.drawerMode = 'menu';
    }
  }

  #setupDrawerSearch() {
    if (!this.#drawerSearchInput || !this.#drawerSuggestions) return;

    this.#drawerSuggestions.hidden = true;
    this.classList.remove('header-drawer--search');
    this.#drawerSearchInput.addEventListener('focus', this.#activateSearchMode);
    this.#drawerSearchInput.addEventListener('input', this.#activateSearchMode);
  }

  #showDrawerSuggestions = () => {
    this.dataset.drawerMode = 'search';
    this.classList.add('header-drawer--search');
    if (this.#drawerSuggestions) {
      this.#drawerSuggestions.hidden = false;
    }
  };

  #activateSearchMode = () => {
    this.dataset.drawerMode = 'search';
    this.#drawerMenuSections.forEach((section) => {
      section.setAttribute('hidden', 'true');
    });
    this.#showDrawerSuggestions();
  };

  #resetDrawerSearch() {
    if (this.#drawerSuggestions) {
      this.#drawerSuggestions.hidden = true;
    }

    if (this.#drawerSearchInput) {
      this.#drawerSearchInput.value = '';
    }

    this.dataset.drawerMode = 'menu';
    this.classList.remove('header-drawer--search');
    this.#drawerMenuSections.forEach((section) => {
      section.removeAttribute('hidden');
    });
  }

  #ensureDrawerVisibleForSearch() {
    if (this.#forcedDrawerContainer) return;

    const container = this.closest('.header__drawer');
    if (!container) return;

    if (!container.classList.contains('desktop:hidden')) return;

    container.classList.remove('desktop:hidden');
    container.classList.add('header__drawer--forced');
    this.#forcedDrawerContainer = container;
  }

  #restoreDrawerVisibility() {
    if (!this.#forcedDrawerContainer) return;

    this.#forcedDrawerContainer.classList.remove('header__drawer--forced');
    this.#forcedDrawerContainer.classList.add('desktop:hidden');
    this.#forcedDrawerContainer = null;
  }

  /**
   * Attach animationend event listeners to all animated elements to remove will-change after animation
   * to remove the stacking context and allow submenus to be positioned correctly
   */
  #setupAnimatedElementListeners() {
    /**
     * @param {AnimationEvent} event
     */
    function removeWillChangeOnAnimationEnd(event) {
      const target = event.target;
      if (target && target instanceof HTMLElement) {
        target.style.setProperty('will-change', 'unset');
        target.removeEventListener('animationend', removeWillChangeOnAnimationEnd);
      }
    }
    const allAnimated = this.querySelectorAll('.menu-drawer__animated-element');
    allAnimated.forEach((element) => {
      element.addEventListener('animationend', removeWillChangeOnAnimationEnd);
    });
  }

  /**
   * Temporarily disables accordion animations to prevent unwanted transitions when the drawer opens.
   * Adds a no-animation class to accordion content elements, then removes it after 100ms to
   * re-enable animations for user interactions.
   * @param {HTMLDetailsElement} details - The details element containing the accordions
   */
  preventInitialAccordionAnimations(details) {
    const content = details.querySelectorAll('accordion-custom .details-content');

    content.forEach((element) => {
      if (element instanceof HTMLElement) {
        element.classList.add('details-content--no-animation');
      }
    });
    setTimeout(() => {
      content.forEach((element) => {
        if (element instanceof HTMLElement) {
          element.classList.remove('details-content--no-animation');
        }
      });
    }, 100);
  }
}

if (!customElements.get('header-drawer')) {
  customElements.define('header-drawer', HeaderDrawer);
}

/**
 * Reset an open details element to its original state
 *
 * @param {HTMLDetailsElement} element
 */
function reset(element) {
  element.classList.remove('menu-open');
  element.removeAttribute('open');
  element.querySelector('summary')?.setAttribute('aria-expanded', 'false');
}
