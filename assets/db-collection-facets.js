const applyFacetDefaults = (root) => {
  const panels = root.querySelectorAll('.facets__item details');

  if (!panels.length) return;

  panels.forEach((details, index) => {
    const hasChecked = Boolean(details.querySelector('input:checked'));
    const hasRangeValue = Array.from(details.querySelectorAll('input[type="number"]')).some(
      (input) => input.value && input.value.trim() !== ''
    );
    const statusBubble = details.querySelector('.bubble');
    const hasStatus = statusBubble && statusBubble.textContent.trim() !== '';

    if (hasChecked || hasRangeValue || hasStatus) {
      details.open = true;
      return;
    }

    details.open = index < 2;
  });
};

const initCollectionFacets = () => {
  document.querySelectorAll('.db-collection-facets').forEach((root) => {
    applyFacetDefaults(root);
  });
};

document.addEventListener('DOMContentLoaded', initCollectionFacets);
document.addEventListener('filter:update', () => {
  window.requestAnimationFrame(() => {
    window.setTimeout(initCollectionFacets, 60);
  });
});
