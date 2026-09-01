// GENERATED FILE — do not edit by hand.
// Regenerate with `npm run presets` after changing a source export in
// `sources/` or `manifest.mjs`. See `README.md`.

import type { Preset } from "@/lib/glyph/presets";

/** Every shipped Preset, in manifest order — which is picker order. */
export const PRESETS: Preset[] = [
  {
    "id": "xbox-brand",
    "label": "Brand",
    "kind": "device",
    "devices": [
      {
        "catalogId": "xbox",
        "style": {
          "background": {
            "shape": "circle",
            "border": {
              "width": 0
            }
          }
        },
        "glyphStyles": {
          "xbox-a": {
            "background": {
              "fill": "#3cdb4e"
            },
            "foreground": {
              "symbolPaints": {
                "fill": "#000000"
              }
            }
          },
          "xbox-b": {
            "background": {
              "fill": "#d04242"
            },
            "foreground": {
              "symbolPaints": {
                "fill": "#000000"
              }
            }
          },
          "xbox-x": {
            "background": {
              "fill": "#40ccd0"
            },
            "foreground": {
              "symbolPaints": {
                "fill": "#000000"
              }
            }
          },
          "xbox-y": {
            "background": {
              "fill": "#ecdb33"
            },
            "foreground": {
              "symbolPaints": {
                "fill": "#000000"
              }
            }
          }
        }
      }
    ]
  },
  {
    "id": "ps-brand",
    "label": "Shapes",
    "kind": "device",
    "devices": [
      {
        "catalogId": "playstation",
        "style": {
          "background": {
            "shape": "circle",
            "border": {
              "width": 0
            }
          }
        },
        "glyphStyles": {
          "ps-triangle": {
            "foreground": {
              "symbolPaints": {
                "fill": "#3ee3a1"
              }
            }
          },
          "ps-circle": {
            "foreground": {
              "symbolPaints": {
                "fill": "#ff6666"
              }
            }
          },
          "ps-cross": {
            "foreground": {
              "symbolPaints": {
                "fill": "#7db3e9"
              }
            }
          },
          "ps-square": {
            "foreground": {
              "symbolPaints": {
                "fill": "#ff69f8"
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
