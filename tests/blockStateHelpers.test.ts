
// Adjust path as necessary
import { deepCopyParametersAndEnsureTypes, getDefaultOutputValue } from '@state/BlockStateManager'; 

// Adjust path as necessary
import { deepCopyParametersAndEnsureTypes, getDefaultOutputValue } from '@state/BlockStateManager'; 
import { BlockParameter } from '@interfaces'; // Import BlockParameterDefinition, removed unused BlockDefinition


describe('useBlockState Helper Functions', () => {

  describe('getDefaultOutputValue', () => {
    it('should return 0 for audio type', () => {
      expect(getDefaultOutputValue('audio')).toBe(0);
    });

    it('should return 0 for number type', () => {
      expect(getDefaultOutputValue('number')).toBe(0);
    });

    it('should return an empty string for string type', () => {
      expect(getDefaultOutputValue('string')).toBe("");
    });

    it('should return false for boolean type', () => {
      expect(getDefaultOutputValue('boolean')).toBe(false);
    });

    it('should return null for trigger type', () => {
      expect(getDefaultOutputValue('trigger')).toBeNull();
    });

    it('should return null for any type', () => {
      expect(getDefaultOutputValue('any')).toBeNull();
    });

    it('should return null for unknown types as a default', () => {
      expect(getDefaultOutputValue('unknown_type' as any)).toBeNull();
    });
  });

  describe('deepCopyParametersAndEnsureTypes', () => {
    // Input parameters for deepCopyParametersAndEnsureTypes should be BlockParameter[]
    const sampleParamDefs: BlockParameter[] = [
      { id: 'p_slider', name: 'Slider', type: 'slider', defaultValue: 50 }, // defaultValue already number
      { id: 'p_knob', name: 'Knob', type: 'knob', defaultValue: 0.5 }, // defaultValue already number
      { id: 'p_num_input', name: 'Number Input', type: 'number_input', defaultValue: 10 }, // defaultValue already number
      { id: 'p_toggle_true', name: 'Toggle True', type: 'toggle', defaultValue: true }, // defaultValue already boolean
      { id: 'p_toggle_false', name: 'Toggle False', type: 'toggle', defaultValue: false }, 
      { id: 'p_select', name: 'Select', type: 'select', defaultValue: "opt2", options: [{value: "opt2", label: "Option 2"}, {value: "opt1", label: "Option 1"}] },
      { id: 'p_text', name: 'Text Input', type: 'text_input', defaultValue: "hello" },
      // Example of a definition where defaultValue might be a string from less-typed source,
      // but deepCopyParametersAndEnsureTypes expects typed defaultValue from BlockParameter.
      // The typing of defaultValue in BlockParameter itself is handled by constants.ts or loading logic.
      { id: 'p_slider_typed_def', name: 'Slider Typed Default', type: 'slider', defaultValue: 10 }, // Assume this was string "10" but typed to 10
      { id: 'p_select_typed_def', name: 'Select Typed Default', type: 'select', defaultValue: "opt1", options: [{value: "opt1", label: "O1"}, {value: "opt2", label: "O2"}] },
    ];

    it('should create a deep copy, not the same reference', () => {
      const copiedParams = deepCopyParametersAndEnsureTypes(sampleParamDefs);
      expect(copiedParams).not.toBe(sampleParamDefs); 
      expect(copiedParams[0]).not.toBe(sampleParamDefs[0]); 
      const originalSelectWithOptions = sampleParamDefs.find(p => p.id === 'p_select');
      const copiedSelectWithOptions = copiedParams.find(p => p.id === 'p_select');
      if (originalSelectWithOptions?.options && copiedSelectWithOptions?.options) {
        expect(copiedSelectWithOptions.options).not.toBe(originalSelectWithOptions.options); 
        expect(copiedSelectWithOptions.options[0]).not.toBe(originalSelectWithOptions.options[0]); 
      }
    });

    it('should correctly set currentValue from typed defaultValue for numeric parameters', () => {
      const copiedParams = deepCopyParametersAndEnsureTypes(sampleParamDefs);
      expect(copiedParams.find(p => p.id === 'p_slider')?.currentValue).toBe(50);
      expect(copiedParams.find(p => p.id === 'p_slider')?.defaultValue).toBe(50);
      expect(copiedParams.find(p => p.id === 'p_knob')?.currentValue).toBe(0.5);
      expect(copiedParams.find(p => p.id === 'p_num_input')?.currentValue).toBe(10);
    });

    it('should correctly set currentValue from typed defaultValue for boolean toggle parameters', () => {
      const copiedParams = deepCopyParametersAndEnsureTypes(sampleParamDefs);
      expect(copiedParams.find(p => p.id === 'p_toggle_true')?.currentValue).toBe(true);
      expect(copiedParams.find(p => p.id === 'p_toggle_false')?.currentValue).toBe(false);
    });

    it('should keep string types for select and text_input and set currentValue from defaultValue', () => {
      const copiedParams = deepCopyParametersAndEnsureTypes(sampleParamDefs);
      expect(copiedParams.find(p => p.id === 'p_select')?.currentValue).toBe("opt2");
      expect(copiedParams.find(p => p.id === 'p_text')?.currentValue).toBe("hello");
    });
    
    it('should handle numeric defaultValue (already typed) correctly', () => {
      const params: BlockParameter[] = [
        { id: 'p1', name: 'P1', type: 'slider', defaultValue: 10 },
        { id: 'p2', name: 'P2', type: 'number_input', defaultValue: 0 }, 
        { id: 'p3', name: 'P3', type: 'knob', defaultValue: 0 }
      ];
      const copied = deepCopyParametersAndEnsureTypes(params);
      expect(copied.find(p=>p.id==='p1')?.currentValue).toBe(10);
      expect(copied.find(p=>p.id==='p1')?.defaultValue).toBe(10);
      expect(copied.find(p=>p.id==='p2')?.currentValue).toBe(0);
      expect(copied.find(p=>p.id==='p2')?.defaultValue).toBe(0);
      expect(copied.find(p=>p.id==='p3')?.currentValue).toBe(0);
      expect(copied.find(p=>p.id==='p3')?.defaultValue).toBe(0);
    });

    it('should handle select defaultValue (already typed) correctly', () => {
      const params: BlockParameter[] = [
        { id: 's1', name: 'S1', type: 'select', defaultValue: "a", options: [{value: "a", label: "A"}, {value: "b", label: "B"}] },
        // If BlockParameter.defaultValue was invalid and not caught by earlier typing,
        // deepCopy should still ideally handle it, but the premise is it receives valid, typed defaultValue.
        { id: 's2', name: 'S2', type: 'select', defaultValue: "c", options: [] }, 
        { id: 's3', name: 'S3', type: 'select', defaultValue: "d" } 
      ];
      const copied = deepCopyParametersAndEnsureTypes(params);
      expect(copied.find(p=>p.id==='s1')?.currentValue).toBe("a");
      expect(copied.find(p=>p.id==='s1')?.defaultValue).toBe("a");
      expect(copied.find(p=>p.id==='s2')?.currentValue).toBe("c"); 
      expect(copied.find(p=>p.id==='s2')?.defaultValue).toBe("c");
      expect(copied.find(p=>p.id==='s3')?.currentValue).toBe("d"); 
      expect(copied.find(p=>p.id==='s3')?.defaultValue).toBe("d");
    });


    it('should preserve all other properties of parameters', () => {
      const copiedParams = deepCopyParametersAndEnsureTypes(sampleParamDefs);
      const originalSlider = sampleParamDefs.find(p => p.id === 'p_slider') as BlockParameter;
      const copiedSlider = copiedParams.find(p => p.id === 'p_slider') as BlockParameter;

      expect(copiedSlider.name).toBe(originalSlider.name);
      expect(copiedSlider.type).toBe(originalSlider.type);
      expect(copiedSlider.defaultValue).toBe(50); 
    });
    
    it('should handle empty parameters array', () => {
        const params: BlockParameter[] = [];
        const copied = deepCopyParametersAndEnsureTypes(params);
        expect(copied).toEqual([]);
        expect(copied).toHaveLength(0);
    });

    it('should correctly initialize currentValue from various typed defaultValues', () => {
        const params: BlockParameter[] = [
            { id: 'p_slider_val', name: 'S Val', type: 'slider', defaultValue: 7 },
            { id: 'p_toggle_val', name: 'T Val', type: 'toggle', defaultValue: true },
            { id: 'p_select_val', name: 'Sel Val', type: 'select', options: [{value:'a', label:'A'}], defaultValue: 'a' },
        ];
        const copied = deepCopyParametersAndEnsureTypes(params);
        expect(copied.find(p=>p.id==='p_slider_val')?.currentValue).toBe(7); 
        expect(copied.find(p=>p.id==='p_slider_val')?.defaultValue).toBe(7);
        expect(copied.find(p=>p.id==='p_toggle_val')?.currentValue).toBe(true);
        expect(copied.find(p=>p.id==='p_toggle_val')?.defaultValue).toBe(true);
        expect(copied.find(p=>p.id==='p_select_val')?.currentValue).toBe('a'); 
        expect(copied.find(p=>p.id==='p_select_val')?.defaultValue).toBe('a');
    });
  });
});
 // Import BlockParameterDefinition, removed unused BlockDefinition


describe('useBlockState Helper Functions', () => {

  describe('getDefaultOutputValue', () => {
    it('should return 0 for audio type', () => {
      expect(getDefaultOutputValue('audio')).toBe(0);
    });

    it('should return 0 for number type', () => {
      expect(getDefaultOutputValue('number')).toBe(0);
    });

    it('should return an empty string for string type', () => {
      expect(getDefaultOutputValue('string')).toBe("");
    });

    it('should return false for boolean type', () => {
      expect(getDefaultOutputValue('boolean')).toBe(false);
    });

    it('should return null for trigger type', () => {
      expect(getDefaultOutputValue('trigger')).toBeNull();
    });

    it('should return null for any type', () => {
      expect(getDefaultOutputValue('any')).toBeNull();
    });

    it('should return null for unknown types as a default', () => {
      expect(getDefaultOutputValue('unknown_type' as any)).toBeNull();
    });
  });

  describe('deepCopyParametersAndEnsureTypes', () => {
    // Input parameters for deepCopyParametersAndEnsureTypes should be BlockParameterDefinition[]
    const sampleParamDefs: BlockParameterDefinition[] = [
      { id: 'p_slider', name: 'Slider', type: 'slider', defaultValue: 50, min: 0, max: 100, step: 1 }, // defaultValue already number
      { id: 'p_knob', name: 'Knob', type: 'knob', defaultValue: 0.5, min: 0, max: 1, step: 0.01 }, // defaultValue already number
      { id: 'p_num_input', name: 'Number Input', type: 'number_input', defaultValue: 10 }, // defaultValue already number
      { id: 'p_toggle_true', name: 'Toggle True', type: 'toggle', defaultValue: true }, // defaultValue already boolean
      { id: 'p_toggle_false', name: 'Toggle False', type: 'toggle', defaultValue: false }, 
      { id: 'p_select', name: 'Select', type: 'select', defaultValue: "opt2", options: [{value: "opt2", label: "Option 2"}, {value: "opt1", label: "Option 1"}] },
      { id: 'p_text', name: 'Text Input', type: 'text_input', defaultValue: "hello" },
      // Example of a definition where defaultValue might be a string from less-typed source,
      // but deepCopyParametersAndEnsureTypes expects typed defaultValue from BlockParameterDefinition.
      // The typing of defaultValue in BlockParameterDefinition itself is handled by constants.ts or loading logic.
      { id: 'p_slider_typed_def', name: 'Slider Typed Default', type: 'slider', defaultValue: 10, min: 10, max: 20 }, // Assume this was string "10" but typed to 10
      { id: 'p_select_typed_def', name: 'Select Typed Default', type: 'select', defaultValue: "opt1", options: [{value: "opt1", label: "O1"}, {value: "opt2", label: "O2"}] },
    ];

    it('should create a deep copy, not the same reference', () => {
      const copiedParams = deepCopyParametersAndEnsureTypes(sampleParamDefs);
      expect(copiedParams).not.toBe(sampleParamDefs); 
      expect(copiedParams[0]).not.toBe(sampleParamDefs[0]); 
      const originalSelectWithOptions = sampleParamDefs.find(p => p.id === 'p_select');
      const copiedSelectWithOptions = copiedParams.find(p => p.id === 'p_select');
      if (originalSelectWithOptions?.options && copiedSelectWithOptions?.options) {
        expect(copiedSelectWithOptions.options).not.toBe(originalSelectWithOptions.options); 
        expect(copiedSelectWithOptions.options[0]).not.toBe(originalSelectWithOptions.options[0]); 
      }
    });

    it('should correctly set currentValue from typed defaultValue for numeric parameters', () => {
      const copiedParams = deepCopyParametersAndEnsureTypes(sampleParamDefs);
      expect(copiedParams.find(p => p.id === 'p_slider')?.currentValue).toBe(50);
      expect(copiedParams.find(p => p.id === 'p_slider')?.defaultValue).toBe(50);
      expect(copiedParams.find(p => p.id === 'p_knob')?.currentValue).toBe(0.5);
      expect(copiedParams.find(p => p.id === 'p_num_input')?.currentValue).toBe(10);
    });

    it('should correctly set currentValue from typed defaultValue for boolean toggle parameters', () => {
      const copiedParams = deepCopyParametersAndEnsureTypes(sampleParamDefs);
      expect(copiedParams.find(p => p.id === 'p_toggle_true')?.currentValue).toBe(true);
      expect(copiedParams.find(p => p.id === 'p_toggle_false')?.currentValue).toBe(false);
    });

    it('should keep string types for select and text_input and set currentValue from defaultValue', () => {
      const copiedParams = deepCopyParametersAndEnsureTypes(sampleParamDefs);
      expect(copiedParams.find(p => p.id === 'p_select')?.currentValue).toBe("opt2");
      expect(copiedParams.find(p => p.id === 'p_text')?.currentValue).toBe("hello");
    });
    
    it('should handle numeric defaultValue (already typed) correctly', () => {
      const params: BlockParameterDefinition[] = [
        { id: 'p1', name: 'P1', type: 'slider', defaultValue: 10, min: 10, max: 20 },
        { id: 'p2', name: 'P2', type: 'number_input', defaultValue: 0 }, 
        { id: 'p3', name: 'P3', type: 'knob', defaultValue: 0, min: undefined, max: 100 }
      ];
      const copied = deepCopyParametersAndEnsureTypes(params);
      expect(copied.find(p=>p.id==='p1')?.currentValue).toBe(10);
      expect(copied.find(p=>p.id==='p1')?.defaultValue).toBe(10);
      expect(copied.find(p=>p.id==='p2')?.currentValue).toBe(0);
      expect(copied.find(p=>p.id==='p2')?.defaultValue).toBe(0);
      expect(copied.find(p=>p.id==='p3')?.currentValue).toBe(0);
      expect(copied.find(p=>p.id==='p3')?.defaultValue).toBe(0);
    });

    it('should handle select defaultValue (already typed) correctly', () => {
      const params: BlockParameterDefinition[] = [
        { id: 's1', name: 'S1', type: 'select', defaultValue: "a", options: [{value: "a", label: "A"}, {value: "b", label: "B"}] },
        // If BlockParameterDefinition.defaultValue was invalid and not caught by earlier typing,
        // deepCopy should still ideally handle it, but the premise is it receives valid, typed defaultValue.
        { id: 's2', name: 'S2', type: 'select', defaultValue: "c", options: [] }, 
        { id: 's3', name: 'S3', type: 'select', defaultValue: "d" } 
      ];
      const copied = deepCopyParametersAndEnsureTypes(params);
      expect(copied.find(p=>p.id==='s1')?.currentValue).toBe("a");
      expect(copied.find(p=>p.id==='s1')?.defaultValue).toBe("a");
      expect(copied.find(p=>p.id==='s2')?.currentValue).toBe("c"); 
      expect(copied.find(p=>p.id==='s2')?.defaultValue).toBe("c");
      expect(copied.find(p=>p.id==='s3')?.currentValue).toBe("d"); 
      expect(copied.find(p=>p.id==='s3')?.defaultValue).toBe("d");
    });


    it('should preserve all other properties of parameters', () => {
      const copiedParams = deepCopyParametersAndEnsureTypes(sampleParamDefs);
      const originalSlider = sampleParamDefs.find(p => p.id === 'p_slider') as BlockParameterDefinition;
      const copiedSlider = copiedParams.find(p => p.id === 'p_slider') as BlockParameter;

      expect(copiedSlider.name).toBe(originalSlider.name);
      expect(copiedSlider.type).toBe(originalSlider.type);
      expect(copiedSlider.min).toBe(originalSlider.min);
      expect(copiedSlider.max).toBe(originalSlider.max);
      expect(copiedSlider.step).toBe(originalSlider.step);
      expect(copiedSlider.defaultValue).toBe(50); 
    });
    
    it('should handle empty parameters array', () => {
        const params: BlockParameterDefinition[] = [];
        const copied = deepCopyParametersAndEnsureTypes(params);
        expect(copied).toEqual([]);
        expect(copied).toHaveLength(0);
    });

    it('should correctly initialize currentValue from various typed defaultValues', () => {
        const params: BlockParameterDefinition[] = [
            { id: 'p_slider_val', name: 'S Val', type: 'slider', min:0, max:10, defaultValue: 7 },
            { id: 'p_toggle_val', name: 'T Val', type: 'toggle', defaultValue: true },
            { id: 'p_select_val', name: 'Sel Val', type: 'select', options: [{value:'a', label:'A'}], defaultValue: 'a' },
        ];
        const copied = deepCopyParametersAndEnsureTypes(params);
        expect(copied.find(p=>p.id==='p_slider_val')?.currentValue).toBe(7); 
        expect(copied.find(p=>p.id==='p_slider_val')?.defaultValue).toBe(7);
        expect(copied.find(p=>p.id==='p_toggle_val')?.currentValue).toBe(true);
        expect(copied.find(p=>p.id==='p_toggle_val')?.defaultValue).toBe(true);
        expect(copied.find(p=>p.id==='p_select_val')?.currentValue).toBe('a'); 
        expect(copied.find(p=>p.id==='p_select_val')?.defaultValue).toBe('a');
    });
  });
});