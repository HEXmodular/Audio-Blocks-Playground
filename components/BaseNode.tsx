import { Handle, Position } from '@xyflow/react';
import styles from './BaseNode.module.css';

const BaseNode = ({ data }) => {

    const inputs = data.definition.inputs;
    const outputs = data.definition.outputs;
  
  
    return (
      <div className={styles.node}>
        <div className={styles.header}>
          {data.label}
        </div>
  
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