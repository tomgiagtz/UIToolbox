import type { Preview } from "@storybook/nextjs-vite";
import { bodyFont, displayFont } from "../src/app/fonts";
import "../src/app/globals.css";

const preview: Preview = {
  // `layout.tsx` declares the two font variables on <html>, which Storybook does
  // not render — without this every story would draw in the fallback face and a
  // type or spacing review here would be reviewing the wrong thing.
  decorators: [
    (Story) => (
      <div className={`${displayFont.variable} ${bodyFont.variable} font-sans`}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
  },
};

export default preview;
