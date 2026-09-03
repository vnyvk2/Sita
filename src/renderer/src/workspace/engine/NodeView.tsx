import { memo, type FC } from 'react';

import type { LayoutNode } from '../types';
import { PanelHost } from './PanelHost';
import { SplitView } from './SplitView';
import { TabGroup } from './TabGroup';

interface NodeViewProps {
  node: LayoutNode;
}

export const NodeView: FC<NodeViewProps> = memo(({ node }) => {
  switch (node.kind) {
    case 'split':
      return <SplitView node={node} />;
    case 'tabs':
      return <TabGroup node={node} />;
    case 'panel':
      return <PanelHost panelId={node.panel} />;
    default:
      return null;
  }
});

NodeView.displayName = 'NodeView';
