// Icons from the mockup sprite (public/icons.svg).
export function icon(name, className = 'ic') {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <use href={'/icons.svg#' + name} />
    </svg>
  );
}
