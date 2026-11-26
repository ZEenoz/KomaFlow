import React, { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { getTranslatedPageThumbnailUrl } from '../canvas/thumbnailRenderer';

/** Props for a translated-page thumbnail fetched by job ID. */
export interface HistoryPageThumbnailProps {
  /** Job whose composited preview should be shown; missing IDs render the fallback icon. */
  jobId?: number;
  /** Classes applied to the thumbnail frame. */
  className: string;
  /** Classes applied to the fallback icon. */
  iconClassName?: string;
}

/**
 * Loads and renders one translated-page preview thumbnail.
 *
 * @param props - Job ID, frame classes, and optional icon classes.
 * @returns Thumbnail image or a neutral placeholder icon.
 */
export const HistoryPageThumbnail: React.FC<HistoryPageThumbnailProps> = ({
  jobId,
  className,
  iconClassName = 'w-4 h-4 text-slate-600',
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setThumbUrl(null);
    if (jobId === undefined) return;

    void getTranslatedPageThumbnailUrl(jobId, 350)
      .then((url) => {
        if (!isCancelled) setThumbUrl(url);
      })
      .catch((err) => {
        console.warn('[HistoryPageThumbnail] Failed loading thumbnail:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [jobId]);

  return (
    <div className={`${className} rounded bg-[#090a0f] border border-[#262a3b] overflow-hidden shrink-0 flex items-center justify-center`}>
      {thumbUrl ? (
        <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <ImageIcon className={iconClassName} />
      )}
    </div>
  );
};
