/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { type MouseEvent as ReactMouseEvent, memo, useLayoutEffect, useRef, useState } from 'react';

import DefaultImage from '../assets/images/webp/song_cover_default.webp';
import { toThumbnailUrl } from '../utils/artwork';
import log from '../utils/log';

interface ImgProperties {
  width: number;
  height: number;
  quality: string;
}

type ImgProps = {
  src?: string;
  fallbackSrc?: string;
  alt?: string;
  noFallbacks?: boolean;
  className?: string;
  onClick?: (_e: ReactMouseEvent<HTMLImageElement, MouseEvent>) => void;
  onError?: (_e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
  loading?: 'eager' | 'lazy';
  onContextMenu?: (_e: ReactMouseEvent<HTMLImageElement, MouseEvent>) => void;
  showImgPropsOnTooltip?: boolean;
  tabIndex?: number;
  showAltAsTooltipLabel?: boolean;
  draggable?: boolean;
  enableImgFadeIns?: boolean;
  decoding?: 'async' | 'auto' | 'sync';
  thumbnail?: boolean;
  /**
   * Decode-then-reveal for virtualized rows: the image starts transparent
   * (over a parent-painted slot, never a blank box) and crossfades in once
   * decoded — with no delay. Unlike the legacy fade path it also honors
   * images that finished decoding before handlers attached (cached bytes can
   * complete synchronously on mount). Opt-in; default preserves legacy behavior.
   */
  revealOnDecode?: boolean;
};

/* <picture
  className={ outline-offset-4 focus-visible:outline! ${className}`}
  tabIndex={tabIndex}
>
  <source srcSet={src} />
  {fallbackSrc && <source srcSet={fallbackSrc} />}
  <img
    onContextMenu={onContextMenu}
    onClick={onClick}
    src={DefaultImage}
    alt="Default placeholder artwork"
    loading={loading}
    className={className}
    onLoad={(e) => {
      if (showImgPropsOnTooltip) {
        const img = new Image();
        img.onload = () => {
          if (img?.width && img?.height)
            imgPropsRef.current = {
              width: img.width,
              height: img.height,
            };
        };
        img.src = e.currentTarget.src;
      }
    }}
    title={
      showImgPropsOnTooltip && imgPropsRef.current
        ? `Quality : ${
            imgPropsRef.current?.width >= 1000 ||
            imgPropsRef.current?.height >= 1000
              ? 'HIGH QUALITY'
              : imgPropsRef.current?.width >= 500 ||
                imgPropsRef.current?.height >= 500
              ? 'MEDIUM QUALITY'
              : 'LOW QUALITY'
          }\nImage width : ${imgPropsRef.current?.width}px\nImage height : ${
            imgPropsRef.current?.height
          }px`
        : showAltAsTooltipLabel
        ? alt
        : undefined
    }
  />
</picture>; */

const Img = memo((props: ImgProps) => {
  const {
    src,
    alt = '',
    className,
    fallbackSrc = DefaultImage,
    noFallbacks = false,
    onClick = () => true,
    onError,
    loading = 'eager',
    onContextMenu,
    showImgPropsOnTooltip = false,
    tabIndex = -1,
    showAltAsTooltipLabel = false,
    draggable = false,
    enableImgFadeIns = true,
    decoding = 'async',
    thumbnail = false,
    revealOnDecode = false
  } = props;

  const imgRef = useRef<HTMLImageElement>(null);
  const imgPropsRef = useRef<ImgProperties>(null);
  const errorCountRef = useRef(0);
  const isFirstTimeRef = useRef(true);
  const prevSrcRef = useRef<string | undefined>(undefined);

  const resolvedSrc = thumbnail ? toThumbnailUrl(src) : src;

  // Row recycling (virtualized lists) reuses this element for a new src:
  // reset the retry budget so the new image gets its own attempts instead of
  // inheriting an exhausted counter and pinning to fallback.
  if (prevSrcRef.current !== resolvedSrc) {
    prevSrcRef.current = resolvedSrc;
    errorCountRef.current = 0;
  }

  // Decode-then-reveal state. Starts hidden so the first paint never flashes
  // the image before we know its decode state; a layout effect (pre-paint)
  // reveals it synchronously when the bytes are already decoded (cached
  // images completing synchronously on mount). Uncached images stay hidden
  // until onLoad — one paint, then the crossfade, no intermediate renders.
  const [isDecoded, setIsDecoded] = useState(false);

  useLayoutEffect(() => {
    if (!revealOnDecode) return;
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setIsDecoded(true);
    }
  }, [revealOnDecode, resolvedSrc]);

  return (
    // <div className="inline-block relative">
    <img
      src={resolvedSrc || fallbackSrc}
      alt={alt}
      ref={imgRef}
      decoding={decoding}
      className={`relative outline-offset-4 focus-visible:!outline ${
        revealOnDecode
          ? `transition-opacity duration-150 ${isDecoded ? 'opacity-100' : 'opacity-0'}`
          : enableImgFadeIns && isFirstTimeRef.current
            ? 'opacity-0 transition-opacity delay-[250ms]'
            : 'opacity-100! transition-none!'
      } ${className}`}
      draggable={draggable}
      onError={(e) => {
        onError?.(e);
        if (thumbnail && src && e.currentTarget.src !== src) {
          e.currentTarget.src = src;
          return;
        }
        if (errorCountRef.current < 3) {
          errorCountRef.current += 1;
          if (!noFallbacks && e.currentTarget.src !== fallbackSrc)
            e.currentTarget.src = fallbackSrc;
          else e.currentTarget.src = DefaultImage;
        } else {
          log(
            'maximum img fetch error count reached.',
            { src, fallbackSrc, props: imgPropsRef.current },
            'WARN'
          );
          e.currentTarget.src = DefaultImage;
        }
      }}
      onClick={onClick}
      title={
        showImgPropsOnTooltip && imgPropsRef.current
          ? `Quality : ${imgPropsRef.current.quality}\nImage width : ${imgPropsRef.current?.width}px\nImage height : ${imgPropsRef.current?.height}px`
          : showAltAsTooltipLabel
            ? alt
            : undefined
      }
      loading={loading}
      onContextMenu={onContextMenu}
      onLoad={(e) => {
        if (revealOnDecode) setIsDecoded(true);
        if (isFirstTimeRef.current) {
          isFirstTimeRef.current = false;
        }
        e.currentTarget.classList.add('opacity-100!');
        if (showImgPropsOnTooltip) {
          const width = e.currentTarget.naturalWidth;
          const height = e.currentTarget.naturalHeight;
          if (width > 0 && height > 0) {
            const imgProp: ImgProperties = {
              width,
              height,
              quality:
                width >= 1000 || height >= 1000
                  ? 'HIGH QUALITY'
                  : width >= 500 || height >= 500
                    ? 'MEDIUM QUALITY'
                    : 'LOW QUALITY'
            };
            imgPropsRef.current = imgProp;
            if (imgRef.current !== null && 'dataset' in imgRef.current) {
              const { dataset } = imgRef.current;
              dataset.width = imgProp.width.toString();
              dataset.height = imgProp.height.toString();
              dataset.quality = imgProp.quality;
            }
          }
        }
      }}
      tabIndex={tabIndex}
    />
    // </div>
  );
});

Img.displayName = 'Img';
export default Img;
