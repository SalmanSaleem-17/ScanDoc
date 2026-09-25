import { View, useWindowDimensions } from "react-native";
import { router, type Href } from "expo-router";
import {
  Card,
  Header,
  Label,
  Loading,
  Screen,
  Section,
  ToolTile,
  type IconName,
} from "../../src/components/ui";
import { useTheme, type Tone } from "../../src/theme/provider";
import { useImport } from "../../src/features/documents/useImport";
import { hasEngine } from "../../src/services/engine";
import { createDraft } from "../../src/services/workspace";
import { NativeAdCard } from "../../src/features/ads/NativeAdCard";

type Tool = {
  name: string;
  icon: IconName;
  tone: Tone;
  route?: Href;
  action?: "import" | "imageToPdf";
  native?: boolean;
};
// Grouped by what the person is holding: a page to capture, a document to
// work on, or a file to change. Tiles match the Quick Tools on Home.
const groups: { title: string; tools: Tool[] }[] = [
  {
    title: "Scan & capture",
    tools: [
      { name: "Scan workspace", icon: "scan-outline", tone: "blue", route: "/workspace" },
      { name: "Image to PDF", icon: "images-outline", tone: "orange", action: "imageToPdf" },
      { name: "Import Files", icon: "download-outline", tone: "cyan", action: "import" },
      { name: "Edit Image", icon: "crop-outline", tone: "emerald", route: "/workspace", native: true },
    ],
  },
  {
    title: "Document",
    tools: [
      { name: "Read Text (OCR)", icon: "text-outline", tone: "green", route: "/ocr", native: true },
      { name: "Receipts", icon: "receipt-outline", tone: "orange", route: "/receipts" },
      { name: "Compare", icon: "git-compare-outline", tone: "violet", route: "/compare", native: true },
    ],
  },
  {
    title: "PDF & image",
    tools: [
      { name: "Merge PDFs", icon: "git-merge-outline", tone: "red", route: "/merge", native: true },
      { name: "Split PDF", icon: "git-branch-outline", tone: "violet", route: "/split", native: true },
      { name: "PDF to Images", icon: "image-outline", tone: "cyan", route: "/pdf-to-image", native: true },
      { name: "Compress PDF", icon: "contract-outline", tone: "purple", route: "/export-size", native: true },
      { name: "Compress Image", icon: "resize-outline", tone: "blue", route: "/compress" },
    ],
  },
];

export default function Tools() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 860) - 40 - 36) / 4);
  const { importDocuments, progress } = useImport();
  function open(tool: Tool) {
    if (tool.action === "import") return void importDocuments();
    if (tool.action === "imageToPdf")
      return void createDraft("document")
        .then((draft) => router.push({ pathname: "/draft/[id]", params: { id: draft.id } }))
        .catch(() => {});
    if (tool.route) router.push(tool.route);
  }
  return (
    <Screen tabScreen>
      <Header title="Tools" subtitle="Everything runs on this device." />
      {progress && <Loading text={progress} />}
      {!hasEngine && (
        <Card>
          <Label style={{ fontSize: 13 }}>
            Tools marked with a dot need the full ScanDoc build. Expo Go
            supports the library, capture, drafts and image compression.
          </Label>
        </Card>
      )}
      {groups.map((group) => (
        <View key={group.title}>
          <Section title={group.title} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, rowGap: 18 }}>
            {group.tools.map((tool) => (
              <View key={tool.name}>
                <ToolTile
                  width={tile}
                  title={tool.name}
                  icon={tool.icon}
                  tone={tool.tone}
                  onPress={() => open(tool)}
                  disabled={tool.action === "import" && !!progress}
                />
                {tool.native && !hasEngine && (
                  <View
                    accessibilityLabel="Needs the ScanDoc build"
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.secondary,
                    }}
                  />
                )}
              </View>
            ))}
          </View>
        </View>
      ))}
      <NativeAdCard />
      <View style={{ height: 8 }} />
    </Screen>
  );
}
