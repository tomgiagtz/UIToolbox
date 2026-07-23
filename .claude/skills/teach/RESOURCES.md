# Adopting third-party React components — Resources

## Knowledge

- [React Aria — ColorPicker](https://react-aria.adobe.com/ColorPicker)
  The container that owns the color state and shares it with child components.
  Primary source for the state model and the "Channel Fields" composition Tom
  asked about. Use for: how one `Color` drives many child views.
- [React Aria — ColorField](https://react-aria.adobe.com/ColorField)
  A single field editing either the whole color (hex) or one channel. Documents
  `value`/`defaultValue`/`onChange` (onChange gives a `Color | null`), plus the
  `colorSpace` and `channel` props. Use for: the leaf component Tom is replacing.
- [React Aria — Color (the value type)](https://react-aria.adobe.com/Color)
  The `Color` object itself: `parseColor()`, `getChannelValue()`,
  `toString(format)`, `toFormat()`. Use for: the string↔object boundary adapter.
- [React Aria Components — Styling](https://react-aria.adobe.com/styling)
  How `react-aria-components` expose state for CSS: `data-*` attributes, render
  props, and className functions. Use for: the styling lesson (matching Tailwind).
- [React docs — "Passing Data Deeply with Context"](https://react.dev/learn/passing-data-deeply-with-context)
  The React primitive under compound components like `ColorPicker`. Use for:
  understanding how a parent shares state with children without prop-drilling.
- [Kent C. Dodds — "Compound Components"](https://kentcdodds.com/blog/compound-components-with-react-hooks)
  The pattern name for `<ColorPicker><ColorField/></ColorPicker>`. Use for:
  recognising the shape when reading any modern component library's docs.

## Wisdom (Communities)

- [React Spectrum Discussions (GitHub)](https://github.com/adobe/react-spectrum/discussions)
  Where the React Aria maintainers and users talk. Use for: "is this the intended
  way to compose X" questions grounded in real code.
- [Reactiflux Discord](https://www.reactiflux.com/)
  Large, fast React community. Use for: general "which library / which pattern"
  gut-checks.

## Gaps
- No single great walkthrough of *migrating* a native input to a React Aria
  component while keeping app state string-based. Taught directly in lessons for
  now; watch for one.
