import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import {
  Card,
  Header,
  Icon,
  Label,
  Loading,
  Screen,
  Section,
  type IconName,
} from "../../src/components/ui";
import { useTheme } from "../../src/theme/provider";
import { useImport } from "../../src/features/documents/useImport";
import { hasEngine } from "../../src/services/engine";

type Tool = {
  name: string;
  detail: string;
  icon: IconName;
  route?: Href;
  native?: boolean;
};
// Grouped by what the person is holding: a page to capture, a document to
// work on, or a file to change. Eleven entries need headings, not a search.
const groups: { title: string; tools: Tool[] }[] = [
  {
    title: "Scan",
    tools: [
      {
        name: "Scan workspace",
        detail: "Unfinished scans, presets and multi-page drafts",
        icon: "scan-outline",
        route: "/workspace",
      },
      {
        name: "Crop, redact & book scan",
        detail: "Edit a copy of any page in the workspace",
        icon: "crop-outline",
        route: "/workspace",
        native: true,
      },
      {
        name: "Import files",
        detail: "Add PDFs and images to your library",
        icon: "download-outline",
      },
    ],
  },
  {
    title: "Document",
    tools: [
      {
        name: "Read text (OCR)",
        detail: "Offline recognition, editable text and search",
        icon: "text-outline",
        route: "/ocr",
        native: true,
      },
      {
        name: "Receipt reports",
        detail: "Reviewed totals, PDF report and CSV",
        icon: "receipt-outline",
        route: "/receipts",
      },
      {
        name: "Compare documents",
        detail: "Changed lines and first-page differences",
        icon: "git-compare-outline",
        route: "/compare",
        native: true,
      },
    ],
  },
  {
    title: "PDF & image",
    tools: [
      {
        name: "Merge PDFs",
        detail: "Combine documents into one file, in your order",
        icon: "git-merge-outline",
        route: "/merge",
        native: true,
      },
      {
        name: "Split PDF",
        detail: "Extract pages or break a document into parts",
        icon: "cut-outline",
        route: "/split",
        native: true,
      },
      {
        name: "PDF to images",
        detail: "Save pages as JPEG files",
        icon: "images-outline",
        route: "/pdf-to-image",
        native: true,
      },
      {
        name: "Compress PDF",
        detail: "Aim for a size limit and see the result",
        icon: "contract-outline",
        route: "/export-size",
        native: true,
      },
      {
        name: "Compress image",
        detail: "Smaller copy, original kept",
        icon: "image-outline",
        route: "/compress",
      },
    ],
  },
];

export default function Tools() {
  const { colors } = useTheme();
  const { importDocuments, progress } = useImport();
  return (
    <Screen tabScreen>
      <Header title="Tools" />
      {progress && <Loading text={progress} />}
      {!hasEngine && (
        <Card>
          <Label style={{ fontSize: 13 }}>
            Tools marked "ScanDoc build" need the full Android app. Expo Go
            supports the library, capture, drafts and image compression.
          </Label>
        </Card>
      )}
      {groups.map((group, index) => (
        <View key={group.title}>
          <Section title={group.title} />
          <Card style={{ paddingVertical: 2, paddingHorizontal: 4 }}>
            {group.tools.map((tool, position) => (
              <Pressable
                key={tool.name}
                accessibilityRole="button"
                accessibilityLabel={tool.name}
                accessibilityHint={tool.detail}
                onPress={() =>
                  tool.route ? router.push(tool.route) : void importDocuments()
                }
                style={({ pressed }) => ({
                  flexDirection: "row",
                  gap: 14,
                  alignItems: "center",
                  minHeight: 64,
                  paddingHorizontal: 12,
                  borderBottomWidth: position < group.tools.length - 1 ? 1 : 0,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Icon name={tool.icon} />
                <View style={{ flex: 1, paddingVertical: 10 }}>
                  <Label style={{ fontWeight: "600", fontSize: 14 }}>
                    {tool.name}
                  </Label>
                  <Label style={{ fontSize: 12, color: colors.secondary }}>
                    {tool.detail}
                    {tool.native && !hasEngine ? " · ScanDoc build" : ""}
                  </Label>
                </View>
                <Icon name="chevron-forward" size={17} color={colors.secondary} />
              </Pressable>
            ))}
          </Card>
          {index === groups.length - 1 && <View style={{ height: 8 }} />}
        </View>
      ))}
    </Screen>
  );
}
