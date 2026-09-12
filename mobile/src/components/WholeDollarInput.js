import TextInput from './AppTextInput';

// Keep existing fractional prices intact until the owner edits them. Never
// turn a pasted decimal such as 25.50 into a different amount such as 2550.
export default function WholeDollarInput({ value, onChangeText, placeholder = '0', ...props }) {
  const text = value == null ? '' : String(value);
  const displayValue = /^\d+\.0+$/.test(text) ? text.split('.')[0] : text;
  return <TextInput {...props} value={displayValue} placeholder={placeholder}
    keyboardType="number-pad" inputMode="numeric"
    onChangeText={next => {
      if (/^\d*$/.test(next)) onChangeText?.(next);
      else if (/^\d+\.0+$/.test(next)) onChangeText?.(next.split('.')[0]);
    }} />;
}
