/** Global SVG filters, mounted once. Stamps and ink marks reference them by id. */
export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        {/* Rubber-stamp ink: slightly wobbly edge + speckled voids where the ink didn't take */}
        <filter id="ink-rough" x="-6%" y="-14%" width="112%" height="128%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="wobble" />
          <feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="1" seed="11" result="speck" />
          <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.85" result="mask" />
          <feComposite in="wobble" in2="mask" operator="in" />
        </filter>
        {/* Ink line: soft bleed into paper fibres */}
        <filter id="ink-bleed" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <radialGradient id="coin-face" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FCE7A6" />
          <stop offset="45%" stopColor="#F0BC3E" />
          <stop offset="100%" stopColor="#C8880E" />
        </radialGradient>
        <radialGradient id="ink-pool" cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#3a4c96" />
          <stop offset="55%" stopColor="#1E2A5A" />
          <stop offset="100%" stopColor="#141c40" />
        </radialGradient>
      </defs>
    </svg>
  )
}
