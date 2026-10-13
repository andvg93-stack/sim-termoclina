export function icon(name, className = '') {
  return `<svg class="icon ${className}" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
}
