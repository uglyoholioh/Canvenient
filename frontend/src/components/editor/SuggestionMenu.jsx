import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export const SuggestionMenu = forwardRef((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  const selectItem = index => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  if (!props.items || !props.items.length) {
    return null;
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border-strong)',
      borderRadius: '6px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      padding: '4px',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      minWidth: '220px',
      maxHeight: '300px',
      overflowY: 'auto',
      zIndex: 9999
    }}>
      {props.items.map((item, index) => (
        <button
          key={index}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
          style={{
            background: index === selectedIndex ? 'var(--surface-active)' : 'transparent',
            border: 'none',
            padding: '6px 10px',
            textAlign: 'left',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            color: 'var(--text-h)'
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: '500' }}>{item.label}</span>
          {item.sublabel && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.sublabel}</span>}
        </button>
      ))}
    </div>
  );
});
