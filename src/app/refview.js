// R: the matching reference thumbnail beside the picture. The images are
// other people's footage, kept in the private, gitignored reference/ folder;
// they are never bundled into the page, so on the published site the panel
// says so instead.
export class RefView {
  constructor(el) {
    this.el = el;
    this.on = false;
    this.img = el.querySelector('img');
    this.label = el.querySelector('.label');
    this.aspect = 0.65;
    this.img.addEventListener('load', () => {
      this.aspect = this.img.naturalWidth / this.img.naturalHeight;
      this.el.classList.remove('missing');
      if (this.onResize) this.onResize();
    });
    this.img.addEventListener('error', () => { this.el.classList.add('missing'); });
  }

  show(cam) {
    this.img.src = `reference/thumbs/${cam.ref}`;
    this.label.textContent = cam.refLabel;
  }

  toggle(cam) {
    this.on = !this.on;
    this.el.style.display = this.on ? '' : 'none';
    if (this.on) this.show(cam);
  }

  width() { return this.on ? Math.round(innerHeight * this.aspect) : 0; }
}
