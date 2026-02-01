import { onDocumentReady } from '@theme/utilities';

const SEA_TEMPLATE_SELECTOR = "main[data-template*='the-sea']";
const HERO_VIDEO_SELECTOR = '.hero__video';
const SEA_HERO_PLAYBACK_RATE = 0.7;

/**
 * @param {HTMLVideoElement} video
 */
function applyPlaybackRate(video) {
  const setRate = () => {
    video.playbackRate = SEA_HERO_PLAYBACK_RATE;
  };

  if (video.readyState >= 1) {
    setRate();
  } else {
    video.addEventListener('loadedmetadata', setRate, { once: true });
  }
}

function updateSeaHeroVideos() {
  const seaTemplate = document.querySelector(SEA_TEMPLATE_SELECTOR);
  if (!seaTemplate) return;

  seaTemplate.querySelectorAll(HERO_VIDEO_SELECTOR).forEach((video) => {
    if (video instanceof HTMLVideoElement) {
      applyPlaybackRate(video);
    }
  });
}

onDocumentReady(() => {
  updateSeaHeroVideos();

  document.addEventListener('shopify:section:load', updateSeaHeroVideos);
});
