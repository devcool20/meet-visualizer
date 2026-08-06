/**
 * Dispatches a laid-out `CardBlock` to its per-kind component.
 *
 * One component per block kind, per the task brief — kept in one file because
 * each is small and they share no state; splitting further would just add
 * import ceremony without any parity or testing benefit.
 */
import type { CardBlock, CardTheme } from '@stash/card-spec';
import type { TextMeasurer } from '@stash/card-core';
import { MetricRow } from './MetricRow.js';
import { BarChart } from './BarChart.js';
import { LineChart } from './LineChart.js';
import { AvatarGrid } from './AvatarGrid.js';
import { StatusList } from './StatusList.js';
import { Bullets } from './Bullets.js';
import { TextBlock } from './TextBlock.js';
import { ImageBlock } from './ImageBlock.js';

export interface BlockRendererProps {
  block: CardBlock;
  theme: CardTheme;
  measure: TextMeasurer;
}

export function BlockRenderer({ block, theme, measure }: BlockRendererProps) {
  switch (block.kind) {
    case 'metric_row':
      return <MetricRow block={block} theme={theme} />;
    case 'bar_chart':
      return <BarChart block={block} theme={theme} />;
    case 'line_chart':
      return <LineChart block={block} theme={theme} />;
    case 'avatar_grid':
      return <AvatarGrid block={block} theme={theme} />;
    case 'status_list':
      return <StatusList block={block} theme={theme} />;
    case 'bullets':
      return <Bullets block={block} theme={theme} measure={measure} />;
    case 'text':
      return <TextBlock block={block} theme={theme} measure={measure} />;
    case 'image':
      return <ImageBlock block={block} theme={theme} />;
  }
}
