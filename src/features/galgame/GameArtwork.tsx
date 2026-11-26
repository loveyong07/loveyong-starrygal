import { useState, type CSSProperties } from "react";
import { BooksIcon } from "@phosphor-icons/react";
import { coverSrc } from "@/lib/asset";
import { artworkPalette, type LibraryGame } from "./model";

export default function GameArtwork({ game }: { game: LibraryGame }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = coverSrc(game.customCoverPath || game.coverPath);
  const palette = artworkPalette(game.title);
  const placeholderStyle = {
    "--gg-art-hue-a": String(palette.hueA),
    "--gg-art-hue-b": String(palette.hueB),
  } as CSSProperties;
  return (
    <div className="gg-artwork">
      {src && failed !== src ? (
        <img
          src={src}
          alt={game.title + "封面"}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="gg-artwork-empty" style={placeholderStyle}>
          <i className="gg-artwork-monogram" aria-hidden="true">
            {palette.monogram}
          </i>
          <BooksIcon size={30} weight="light" />
          <span>封面待补充</span>
        </span>
      )}
    </div>
  );
}
