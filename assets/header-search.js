import { Component } from '@theme/component';
import { prefersReducedMotion } from '@theme/utilities';

class HeaderSearch extends Component {
  requiredRefs = ['placeholder'];

  #timeout = null;
  #index = 0;
  #charIndex = 0;
  #isDeleting = false;
  #categories = [];
  #prefix = '';
  #trigger = null;
  #isGlobalListenerBound = false;

  connectedCallback() {
    super.connectedCallback();

    this.#prefix = (this.dataset.placeholderPrefix || '').trim();
    this.#categories = this.#getCategories();
    this.#trigger = this.querySelector('.header-search__trigger');
    if (this.#trigger) {
      this.#trigger.addEventListener('keydown', this.#handleKeydown);
    }
    if (!this.#isGlobalListenerBound) {
      document.addEventListener('keydown', this.#handleGlobalKeydown);
      this.#isGlobalListenerBound = true;
    }

    if (!this.#categories.length) {
      this.refs.placeholder.textContent = this.#prefix;
      return;
    }

    if (prefersReducedMotion() || this.#categories.length === 1) {
      this.refs.placeholder.textContent = this.#buildText(this.#categories[0] || '');
      return;
    }

    this.addEventListener('mouseenter', this.#pause);
    this.addEventListener('mouseleave', this.#resume);
    this.addEventListener('focusin', this.#pause);
    this.addEventListener('focusout', this.#resume);

    this.#resume();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#stop();
    if (this.#trigger) {
      this.#trigger.removeEventListener('keydown', this.#handleKeydown);
    }
    if (this.#isGlobalListenerBound) {
      document.removeEventListener('keydown', this.#handleGlobalKeydown);
      this.#isGlobalListenerBound = false;
    }
  }

  #getCategories() {
    const raw = this.dataset.placeholderCategories || '[]';

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (error) {
      return [];
    }

    return [];
  }

  #buildText(typedText = '') {
    if (!this.#prefix) return typedText;
    const spacer = this.#prefix.endsWith(' ') || typedText === '' ? '' : ' ';
    return `${this.#prefix}${spacer}${typedText}`.trimEnd();
  }

  #resume = () => {
    if (this.#timeout) return;
    this.#advance();
  };

  #pause = () => {
    this.#stop();
  };

  #stop() {
    if (this.#timeout) {
      clearTimeout(this.#timeout);
      this.#timeout = null;
    }
  }

  #advance = () => {
    const category = this.#categories[this.#index] || '';
    let delay = 85;

    if (this.#isDeleting) {
      this.#charIndex -= 1;
      delay = 40;

      if (this.#charIndex <= 0) {
        this.#isDeleting = false;
        this.#index = (this.#index + 1) % this.#categories.length;
        delay = 300;
      }
    } else {
      this.#charIndex += 1;

      if (this.#charIndex >= category.length) {
        this.#isDeleting = true;
        delay = 1200;
      }
    }

    const visibleText = category.slice(0, Math.max(this.#charIndex, 0));
    this.refs.placeholder.textContent = this.#buildText(visibleText);
    this.#timeout = window.setTimeout(this.#advance, delay);
  };

  #handleKeydown = (event) => {
    if (event.defaultPrevented) return;
    if (!this.#isTextKey(event)) return;

    event.preventDefault();
    this.#openDrawerSearch(event.key);
  };

  #handleGlobalKeydown = (event) => {
    if (event.defaultPrevented) return;
    if (this.#isTypingInField(event)) return;
    if (!this.#isTextKey(event)) return;

    event.preventDefault();
    this.#openDrawerSearch(event.key);
  };

  #isTextKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    if (!event.key || event.key.length !== 1) return false;
    return event.key.trim().length > 0;
  }

  #isTypingInField(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  }

  #openDrawerSearch(typedKey) {
    const drawer = document.querySelector('#HeaderDrawer');
    if (!drawer || typeof drawer.openSearch !== 'function') return;

    drawer.openSearch();
    const input = drawer.querySelector('[data-drawer-search-input]');
    if (!input) return;

    input.value = `${input.value}${typedKey}`;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }
}

if (!customElements.get('header-search')) {
  customElements.define('header-search', HeaderSearch);
}
