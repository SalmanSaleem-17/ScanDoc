import { useCallback, useState } from "react";
import { Image, Pressable, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  Label,
  Loading,
  BrandHeader,
  RowCard,
  Screen,
  Section,
  ToolTile,
  type IconName,
} from "../../src/components/ui";
import { FolderArt, ScanArt } from "../../src/components/art";
import { useTheme, type Tone } from "../../src/theme/provider";
import { useDocuments } from "../../src/features/documents/provider";
import { useImport } from "../../src/features/documents/useImport";
import { DocumentCard } from "../../src/features/documents/DocumentCard";
import { createDraft, listDrafts } from "../../src/services/workspace";

// Home: the scan card, the eight tools people reach for most, a way back
// into unfinished scans when there are any, and the latest documents.
export default function Home() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { documents, loading, error, refresh } = useDocuments();
  const { importDocuments, progress } = useImport();
  const [drafts, setDrafts] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      listDrafts()
        .then((rows) => {
          if (live) setDrafts(rows.length);
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, []),
  );
  const recent = documents.filter((d) => !d.trashedAt).slice(0, 4);
  // Four tiles per row inside the 20 px screen padding, 12 px apart.
  const tile = Math.floor((Math.min(width, 860) - 40 - 36) / 4);
  const tools: { title: string; icon: IconName; tone: Tone; onPress: () => void; disabled?: boolean }[] = [
    { title: "Import Files", icon: "download-outline", tone: "blue", onPress: importDocuments, disabled: !!progress },
    { title: "Read Text (OCR)", icon: "text-outline", tone: "green", onPress: () => router.push("/ocr") },
    { title: "Merge PDFs", icon: "git-merge-outline", tone: "red", onPress: () => router.push("/merge") },
    { title: "Compress PDF", icon: "contract-outline", tone: "purple", onPress: () => router.push("/export-size") },
    {
      title: "Image to PDF",
      icon: "images-outline",
      tone: "orange",
      onPress: () =>
        void createDraft("document")
          .then((draft) => router.push({ pathname: "/draft/[id]", params: { id: draft.id } }))
          .catch(() => {}),
    },
    { title: "Split PDF", icon: "git-branch-outline", tone: "violet", onPress: () => router.push("/split") },
    { title: "PDF to Images", icon: "image-outline", tone: "cyan", onPress: () => router.push("/pdf-to-image") },
    { title: "Edit Image", icon: "crop-outline", tone: "emerald", onPress: () => router.push("/workspace") },
  ];
  return (
    <Screen tabScreen>
      <BrandHeader
        logo={
          <Image
            source={require("../../assets/icon.png")}
            style={{ width: 52, height: 52, borderRadius: 14 }}
          />
        }
        actions={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <IconButton
              name="search-outline"
              label="Search documents"
              onPress={() => router.push("/documents")}
            />
            <IconButton
              name="settings-outline"
              label="Settings"
              onPress={() => router.push("/settings")}
            />
          </View>
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a document with your camera"
        onPress={() => router.push("/scanner")}
      >
        <LinearGradient
          colors={colors.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 24,
            padding: 22,
            minHeight: 210,
            overflow: "hidden",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1.1, gap: 8, zIndex: 1 }}>
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 12,
                backgroundColor: `${colors.blue}22`,
              }}
            >
              <Label style={{ color: colors.blue, fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1 }}>
                SCAN
              </Label>
            </View>
            <Label
              style={{
                color: colors.heroText,
                fontSize: 26,
                lineHeight: 32,
                fontWeight: "800",
                letterSpacing: -0.6,
              }}
            >
              Scan a{" "}
              <Label style={{ color: colors.blue, fontSize: 26, lineHeight: 32, fontWeight: "800" }}>
                Document
              </Label>
            </Label>
            <Label style={{ color: colors.heroMuted, fontSize: 14, lineHeight: 20 }}>
              Turn your photos into clean, high-quality scans.
            </Label>
            <View style={{ alignSelf: "flex-start", marginTop: 6 }}>
              <Button
                title="Scan Now"
                icon="camera"
                trailingIcon="chevron-forward"
                onPress={() => router.push("/scanner")}
              />
            </View>
          </View>
          <View style={{ flex: 0.9, alignItems: "flex-end", marginRight: -14 }}>
            <ScanArt width={170} height={160} />
          </View>
        </LinearGradient>
      </Pressable>
      <Section title="Quick Tools" action="See All" onPress={() => router.push("/tools")} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, rowGap: 18 }}>
        {tools.map((tool) => (
          <ToolTile key={tool.title} width={tile} {...tool} />
        ))}
      </View>
      {progress && <Loading text={progress} />}
      {drafts > 0 && (
        <RowCard
          style={{ marginTop: 20 }}
          icon="layers-outline"
          title={`Resume ${drafts} unfinished ${drafts === 1 ? "scan" : "scans"}`}
          detail="Continue where you left off"
          onPress={() => router.push("/workspace")}
        />
      )}
      <Section
        title="Recent Documents"
        action={recent.length ? "See All" : undefined}
        onPress={() => router.push("/documents")}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <EmptyState
          title="Library unavailable"
          description={error}
          action={<Button title="Try again" onPress={refresh} />}
        />
      ) : recent.length ? (
        recent.map((document) => (
          <DocumentCard key={document.id} document={document} />
        ))
      ) : (
        <EmptyState
          art={<FolderArt />}
          title="No documents yet"
          description="Scan a page or import a PDF to get started."
          action={
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title="Scan Document" icon="camera" onPress={() => router.push("/scanner")} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Import Files" icon="folder-open-outline" secondary onPress={importDocuments} />
              </View>
            </View>
          }
        />
      )}
      <View style={{ height: 8 }} />
      <Label style={{ fontSize: 12, color: colors.secondary, textAlign: "center" }}>
        <Icon name="shield-checkmark-outline" size={12} color={colors.success} /> Documents never leave this device.
      </Label>
    </Screen>
  );
}
