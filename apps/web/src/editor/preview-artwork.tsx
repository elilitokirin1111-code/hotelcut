import type { PreviewArtworkKind } from './editor-asset';

interface PreviewArtworkProps {
  artwork: PreviewArtworkKind;
  colors: readonly [string, string];
}

export function PreviewArtwork({ artwork, colors }: PreviewArtworkProps) {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 540 960"
    >
      <defs>
        <linearGradient id={`scene-${artwork}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={colors[0]} />
          <stop offset="100%" stopColor={colors[1]} />
        </linearGradient>
        <linearGradient id="window-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8dec0" stopOpacity=".9" />
          <stop offset="100%" stopColor="#c9d8d2" stopOpacity=".55" />
        </linearGradient>
      </defs>
      <rect width="540" height="960" fill={`url(#scene-${artwork})`} />

      {artwork === 'lake' && (
        <>
          <circle cx="392" cy="230" r="68" fill="#f4d4a3" opacity=".78" />
          <path d="M0 454 122 336l95 83 80-122 157 157 86-72v306H0Z" fill="#294b4f" opacity=".72" />
          <path
            d="M0 570c110-40 184 35 286-7 96-40 174-20 254 12v385H0Z"
            fill="#183b44"
            opacity=".76"
          />
          <path
            d="M42 635c110 24 203-10 303 5 67 10 107 3 153-10"
            stroke="#d6c7ae"
            strokeWidth="5"
            opacity=".35"
          />
          <path
            d="M75 692c80 16 160-4 245 8 61 9 109 1 151-7"
            stroke="#d6c7ae"
            strokeWidth="3"
            opacity=".25"
          />
        </>
      )}

      {artwork === 'host' && (
        <>
          <rect x="56" y="74" width="428" height="530" rx="8" fill="#1d3033" opacity=".34" />
          <rect x="82" y="102" width="376" height="452" fill="url(#window-light)" opacity=".84" />
          <path d="M82 390 194 292l72 68 64-96 128 126v164H82Z" fill="#55736f" opacity=".68" />
          <ellipse cx="274" cy="387" rx="77" ry="92" fill="#d4a184" />
          <path
            d="M196 362c12-90 147-112 168 4-23-23-45-36-86-35-28 0-52 12-82 31Z"
            fill="#332b29"
          />
          <path d="M148 804c12-183 68-283 126-283 64 0 122 104 134 283Z" fill="#eee2d2" />
          <path d="M217 553c23 48 94 49 116 0" fill="none" stroke="#c68d73" strokeWidth="7" />
          <rect y="800" width="540" height="160" fill="#1a2527" opacity=".45" />
        </>
      )}

      {(artwork === 'room' || artwork === 'suite') && (
        <>
          <rect x="54" y="88" width="432" height="432" rx="10" fill="#3c302c" opacity=".38" />
          <rect x="82" y="116" width="376" height="348" fill="url(#window-light)" />
          <path d="M82 330 188 253l92 81 64-70 114 76v124H82Z" fill="#718b83" opacity=".72" />
          <path d="M0 592h540v368H0Z" fill="#463833" opacity=".82" />
          <rect x="62" y="620" width="416" height="222" rx="25" fill="#e6d3bd" />
          <rect x="89" y="565" width="150" height="112" rx="18" fill="#f2e8da" />
          <rect x="247" y="565" width="178" height="112" rx="18" fill="#dac1a6" />
          <path d="M62 736h416" stroke="#af8a6c" strokeWidth="12" opacity=".54" />
          {artwork === 'suite' && (
            <>
              <circle cx="454" cy="547" r="45" fill="#c48b51" opacity=".8" />
              <rect x="445" y="578" width="18" height="95" rx="8" fill="#5e4638" />
            </>
          )}
        </>
      )}

      {artwork === 'breakfast' && (
        <>
          <rect x="45" y="70" width="450" height="520" fill="url(#window-light)" opacity=".82" />
          <path d="M45 390 155 295l95 82 86-112 159 141v184H45Z" fill="#657f77" opacity=".7" />
          <ellipse cx="270" cy="780" rx="260" ry="142" fill="#5c3d31" />
          <circle cx="266" cy="733" r="96" fill="#e5d3b6" />
          <circle cx="266" cy="733" r="70" fill="#f2e4ce" />
          <circle cx="246" cy="712" r="25" fill="#d79049" />
          <path d="M312 680c32 23 43 61 12 98" fill="none" stroke="#718f54" strokeWidth="18" />
          <rect x="80" y="650" width="56" height="115" rx="20" fill="#dab677" opacity=".9" />
        </>
      )}

      {artwork === 'lobby' && (
        <>
          <path d="M0 0h540v960H0Z" fill="#3a2925" opacity=".3" />
          <rect x="70" y="92" width="400" height="560" rx="160" fill="#b97749" opacity=".34" />
          <rect x="112" y="132" width="316" height="466" rx="136" fill="#2f2929" opacity=".72" />
          <circle cx="270" cy="246" r="74" fill="#e9bd76" opacity=".8" />
          <path d="M270 0v172" stroke="#d5a46d" strokeWidth="10" />
          <rect x="50" y="664" width="440" height="202" rx="78" fill="#7f5748" />
          <rect x="88" y="626" width="152" height="126" rx="34" fill="#d3b59b" />
          <rect x="300" y="626" width="152" height="126" rx="34" fill="#bd9274" />
        </>
      )}

      {artwork === 'spa' && (
        <>
          <circle cx="270" cy="280" r="188" fill="#9ac0ba" opacity=".24" />
          <circle cx="270" cy="280" r="132" fill="#c0d7d0" opacity=".16" />
          <path
            d="M0 510c90-42 165-9 249-31 115-30 194 7 291 38v443H0Z"
            fill="#173941"
            opacity=".7"
          />
          <path
            d="M0 607c102-31 165 12 261-11 105-25 180 19 279 4"
            fill="none"
            stroke="#a8c6bd"
            strokeWidth="8"
            opacity=".45"
          />
          <path
            d="M0 685c110-26 192 17 282-5 82-20 169 11 258-4"
            fill="none"
            stroke="#a8c6bd"
            strokeWidth="5"
            opacity=".28"
          />
          <ellipse cx="145" cy="790" rx="92" ry="42" fill="#8a9e8c" opacity=".75" />
          <ellipse cx="352" cy="834" rx="118" ry="54" fill="#71877c" opacity=".7" />
        </>
      )}
    </svg>
  );
}
