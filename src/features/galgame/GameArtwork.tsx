import { useState } from "react";
import { BooksIcon } from "@phosphor-icons/react";
import { coverSrc } from "@/lib/asset";
import type { LibraryGame } from "./model";

export default function GameArtwork({ game }: { game: LibraryGame }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = coverSrc(game.customCoverPath || game.coverPath);
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
        <span className="gg-artwork-empty">
          <BooksIcon size={32} weight="light" />
          <span>封面待补充</span>
        </span>
      )}
    </div>
  );
}
