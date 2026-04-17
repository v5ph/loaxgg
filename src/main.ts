function setupCopyButtons(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-copy-target]");

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = button.dataset.copyTarget;
      if (!targetId) return;

      const target = document.getElementById(targetId);
      const value = target?.getAttribute("data-copy-value");
      if (!value) return;

      try {
        await navigator.clipboard.writeText(value);
        button.dataset.copied = "true";
        window.setTimeout(() => {
          button.dataset.copied = "false";
        }, 1400);
      } catch {
        button.dataset.copied = "false";
      }
    });
  });
}

function setupTypewriter(): void {
  const target = document.querySelector<HTMLElement>("[data-type-target]");
  if (!target) return;

  const frames = [
    "\"scan meme coin liquidity\"",
    "\"stress test an options hedge\"",
    "\"simulate a whale exit\"",
  ];

  let frameIndex = 0;
  let charIndex = 0;
  let deleting = false;

  const tick = (): void => {
    const current = frames[frameIndex];

    if (deleting) {
      charIndex = Math.max(0, charIndex - 1);
    } else {
      charIndex = Math.min(current.length, charIndex + 1);
    }

    target.textContent = current.slice(0, charIndex);

    let delay = deleting ? 45 : 70;

    if (!deleting && charIndex === current.length) {
      delay = 1100;
      deleting = true;
    } else if (deleting && charIndex === 0) {
      deleting = false;
      frameIndex = (frameIndex + 1) % frames.length;
      delay = 220;
    }

    window.setTimeout(tick, delay);
  };

  tick();
}

setupCopyButtons();
setupTypewriter();
