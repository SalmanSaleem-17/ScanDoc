import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import {
  Card,
  EmptyState,
  Header,
  Icon,
  Label,
  Loading,
  Screen,
  SearchBar,
  Section,
  type IconName,
} from "../../src/components/ui";
import { useTheme } from "../../src/theme/provider";
import { useImport } from "../../src/features/documents/useImport";
import { hasEngine } from "../../src/services/engine";
export default function Tools() {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const { importDocuments, progress } = useImport();
  const items: {
    name: string;
    detail: string;
    group: string;
    icon: IconName;
    route?: Href;
    native?: boolean;
  }[] = [
    {
      name: "Scan workspace",
      detail: "Resume drafts, presets and multi-page scans",
      group: "Scan & capture",
      icon: "scan-outline",
      route: "/workspace",
    },
    {
      name: "Crop, redact & book scan",
      detail: "Create an editable copy in your workspace",
      group: "Scan & capture",
      icon: "crop-outline",
      route: "/workspace",
      native: true,
    },
    {
      name: "Import files",
      detail: "Add PDFs and images to your library",
      group: "Scan & capture",
      icon: "download-outline",
    },
    {
      name: "Text & smart naming",
      detail: "Offline OCR, editable text and local search",
      group: "Document",
      icon: "text-outline",
      route: "/ocr",
      native: true,
    },
    {
      name: "Receipt reports",
      detail: "Reviewed totals, PDF reports and CSV export",
      group: "Document",
      icon: "receipt-outline",
      route: "/receipts",
    },
    {
      name: "Compare documents",
      detail: "Text changes and first-page visual differences",
      group: "Document",
      icon: "git-compare-outline",
      route: "/compare",
      native: true,
    },
    {
      name: "Export size target",
      detail: "Try a smaller PDF for upload limits",
      group: "PDF & image",
      icon: "contract-outline",
      route: "/export-size",
      native: true,
    },
    {
      name: "Compress image",
      detail: "Reduce size and preserve your original",
      group: "PDF & image",
      icon: "image-outline",
      route: "/compress",
    },
  ];
  const visible = items.filter((item) =>
    `${item.name} ${item.detail}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Screen>
      <Header
        title="A little less effort."
        subtitle="Practical tools. Private by default."
      />
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search tools"
      />
      {progress && <Loading text={progress} />}{" "}
      {!hasEngine && (
        <Card style={{ marginTop: 16 }}>
          <Label style={{ fontSize: 13 }}>
            Advanced tools require the ScanDoc Android development build. Expo
            Go supports the library, capture, drafts, and basic image
            compression.
          </Label>
        </Card>
      )}
      {["Scan & capture", "Document", "PDF & image"].map((group) => (
        <View key={group}>
          {visible.some((t) => t.group === group) && <Section title={group} />}{" "}
          {visible
            .filter((t) => t.group === group)
            .map((tool) => (
              <Pressable
                key={tool.name}
                accessibilityRole="button"
                onPress={() =>
                  tool.route ? router.push(tool.route) : void importDocuments()
                }
              >
                <Card
                  style={{
                    flexDirection: "row",
                    gap: 14,
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Icon name={tool.icon} />
                  <View style={{ flex: 1 }}>
                    <Label style={{ fontWeight: "600" }}>{tool.name}</Label>
                    <Label style={{ fontSize: 12, color: colors.secondary }}>
                      {tool.detail}
                    </Label>
                    {tool.native && !hasEngine && (
                      <Label style={{ fontSize: 11, color: colors.secondary }}>
                        Development build required
                      </Label>
                    )}
                  </View>
                  <Icon name="chevron-forward" size={17} />
                </Card>
              </Pressable>
            ))}
        </View>
      ))}
      {!visible.length && (
        <EmptyState
          title="No matching tools"
          description="Try scan, text, receipts, or compare."
        />
      )}
    </Screen>
  );
}
