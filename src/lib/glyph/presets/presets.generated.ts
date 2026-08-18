// GENERATED FILE — do not edit by hand.
// Regenerate with `npm run presets` after changing a source export in
// `sources/` or `manifest.mjs`. See `README.md`.

import type { Preset } from "@/lib/glyph/presets";

/** Every shipped Preset, in manifest order — which is picker order. */
export const PRESETS: Preset[] = [
  {
    "id": "xbox-neon",
    "label": "Neon",
    "kind": "device",
    "devices": [
      {
        "catalogId": "xbox",
        "style": {
          "background": {
            "fill": "#0b1020",
            "cornerRadius": 30,
            "border": {
              "width": 6,
              "color": "#22d3ee"
            }
          },
          "foreground": {
            "fontFamily": "JetBrains Mono",
            "fontWeight": 700,
            "textColor": "#22d3ee",
            "symbolPaints": {
              "fill": "#22d3ee",
              "border": "#0b1020",
              "secondary": "#f0abfc"
            }
          }
        },
        "glyphStyles": {
          "xbox-a": {
            "background": {
              "border": {
                "color": "#4ade80"
              }
            },
            "foreground": {
              "symbolPaints": {
                "fill": "#4ade80"
              }
            }
          },
          "xbox-b": {
            "background": {
              "border": {
                "color": "#fb7185"
              }
            },
            "foreground": {
              "symbolPaints": {
                "fill": "#fb7185"
              }
            }
          },
          "xbox-x": {
            "background": {
              "border": {
                "color": "#60a5fa"
              }
            },
            "foreground": {
              "symbolPaints": {
                "fill": "#60a5fa"
              }
            }
          },
          "xbox-y": {
            "background": {
              "border": {
                "color": "#fde047"
              }
            },
            "foreground": {
              "symbolPaints": {
                "fill": "#fde047"
              }
            }
          },
          "xbox-left-stick": {
            "foreground": {
              "symbolPaints": {
                "secondary": "#22d3ee"
              }
            }
          },
          "xbox-right-stick": {
            "foreground": {
              "symbolPaints": {
                "secondary": "#f0abfc"
              }
            }
          }
        }
      }
    ]
  },
  {
    "id": "arcade",
    "label": "Arcade",
    "kind": "project",
    "style": {
      "background": {
        "source": {
          "kind": "shape"
        },
        "transform": {
          "rotation": 0,
          "scale": {
            "x": 1,
            "y": 1
          }
        },
        "shape": "circle",
        "fill": "#2a0e3f",
        "cornerRadius": 18,
        "border": {
          "width": 8,
          "color": "#f59e0b"
        }
      },
      "foreground": {
        "transform": {
          "rotation": 0,
          "scale": {
            "x": 1,
            "y": 1
          }
        },
        "fontFamily": "Titan One",
        "fontWeight": 400,
        "textColor": "#fde68a",
        "symbolPaints": {
          "fill": "#fde68a",
          "border": "#7c2d12",
          "secondary": "#f97316"
        }
      }
    },
    "devices": [
      {
        "catalogId": "keyboard",
        "style": {
          "background": {
            "shape": "rounded-rect",
            "cornerRadius": 24
          }
        },
        "glyphStyles": {
          "key-space": {
            "background": {
              "fill": "#3b0764"
            }
          },
          "key-enter": {
            "foreground": {
              "symbolPaints": {
                "fill": "#f97316"
              }
            }
          }
        }
      },
      {
        "catalogId": "xbox",
        "style": {
          "background": {
            "border": {
              "width": 10
            }
          }
        },
        "glyphStyles": {
          "xbox-lb": {
            "background": {
              "fill": "#f59e0b"
            },
            "foreground": {
              "textColor": "#2a0e3f"
            }
          },
          "xbox-rb": {
            "background": {
              "fill": "#f59e0b"
            },
            "foreground": {
              "textColor": "#2a0e3f"
            }
          }
        }
      }
    ]
  }
];
