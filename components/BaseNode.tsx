import { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { compactRendererRegistry } from '@/services/block-definitions/compactRendererRegistry';

import styles from './BaseNode.module.css';

const BaseNode = ({ data }) => {
  const inputs = data.definition.inputs;
  const outputs = data.definition.outputs;
  const { instance, definition } = data;
  
  const CompactRendererComponent = useCallback(() => {
    if (definition.compactRendererId) {
      const CR = compactRendererRegistry[definition.compactRendererId];
      if (CR) {
        return (<CR blockInstance={instance} blockDefinition={definition}></CR>)
      }
    }

    return null;
  }, [
    [data.instance, data.definition]
  ])

  return (
    <div className={styles.node}>
      <div className={styles.header}>
        {data.label}
      </div>

      {CompactRendererComponent()}

      {inputs.map((input) => (
        <div className={styles.portIn}>
          <Handle id={input.id} type="target" position={Position.Left} />
          <div>{input.name}</div>
        </div>
      ))}

      {outputs.map((output) => (
        <div className={styles.portOut}>
          <div>{output.name}</div>
          <Handle id={output.id} type="source" position={Position.Right} />
        </div>
      ))}

    </div>
  );
};

export default BaseNode;