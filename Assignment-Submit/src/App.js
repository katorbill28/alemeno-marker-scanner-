import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { detectMarkerFromJpegBase64 } from "./detector/markerDetector";

const TARGET_RESULTS = 20;
const MAX_ATTEMPTS = 60;
const SAMPLE_MARKERS = [
  require("../assets/reference/Marker1-TestImages/Correct Marker Images/Marker1-TestImage1-Correct.jpg"),
  require("../assets/reference/Marker1-TestImages/Correct Marker Images/Marker1-TestImage2-Correct.jpg"),
  require("../assets/reference/Marker1-TestImages/Correct Marker Images/Marker1-TestImage3-Correct.jpg")
];

function pickSquarePictureSize(sizes) {
  const squareSizes = sizes
    .map((size) => {
      const [width, height] = size.split("x").map(Number);
      return { size, width, height };
    })
    .filter(({ width, height }) => width === height && width >= 2000 && width <= 3000)
    .sort((a, b) => Math.abs(a.width - 2500) - Math.abs(b.width - 2500));

  return squareSizes[0]?.size || "2448x2448";
}

export default function App() {
  const cameraRef = useRef(null);
  const scanCancelled = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [pictureSize, setPictureSize] = useState("2448x2448");
  const [results, setResults] = useState([]);
  const [attempts, setAttempts] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [lastMessage, setLastMessage] = useState("Ready to scan Marker 1");
  const [elapsedMs, setElapsedMs] = useState(0);

  const progress = useMemo(() => `${results.length}/${TARGET_RESULTS}`, [results.length]);

  const onCameraReady = useCallback(async () => {
    setCameraReady(true);
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync("1:1");
      if (sizes?.length) setPictureSize(pickSquarePictureSize(sizes));
    } catch {
      setPictureSize("2448x2448");
    }
  }, []);

  const stopScan = useCallback(() => {
    scanCancelled.current = true;
    setIsScanning(false);
    setLastMessage("Scan paused");
  }, []);

  const resetScan = useCallback(() => {
    scanCancelled.current = true;
    setResults([]);
    setAttempts(0);
    setElapsedMs(0);
    setIsScanning(false);
    setLastMessage("Ready to scan Marker 1");
  }, []);

  const loadSampleResults = useCallback(() => {
    scanCancelled.current = true;
    const sampleResults = Array.from({ length: TARGET_RESULTS }, (_, index) => ({
      id: `sample-${index + 1}`,
      source: SAMPLE_MARKERS[index % SAMPLE_MARKERS.length],
      score: "sample",
      durationMs: 0
    }));
    setResults(sampleResults);
    setAttempts(TARGET_RESULTS);
    setElapsedMs(0);
    setIsScanning(false);
    setLastMessage("Loaded 20 supplied correct marker samples");
  }, []);

  const startScan = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || isScanning) return;

    scanCancelled.current = false;
    setIsScanning(true);
    setResults([]);
    setAttempts(0);
    setElapsedMs(0);
    setLastMessage("Scanning");
    const startedAt = Date.now();
    const accepted = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (scanCancelled.current) break;
      setAttempts(attempt);

      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          exif: false,
          quality: 0.9,
          skipProcessing: true
        });

        const detection = detectMarkerFromJpegBase64(photo.base64);
        if (detection.ok) {
          accepted.push({
            id: `${attempt}-${Date.now()}`,
            uri: `data:image/jpeg;base64,${detection.base64}`,
            score: detection.score,
            durationMs: detection.durationMs
          });
          setResults([...accepted]);
          setLastMessage(`Detected marker ${accepted.length}`);
        } else {
          setLastMessage(detection.reason);
        }

        if (accepted.length === TARGET_RESULTS) break;
      } catch (error) {
        setLastMessage(error?.message || "Camera frame failed");
      }
    }

    setElapsedMs(Date.now() - startedAt);
    setIsScanning(false);
    if (accepted.length === TARGET_RESULTS) {
      setLastMessage("20 markers extracted");
    } else if (!scanCancelled.current) {
      setLastMessage(`Stopped after ${MAX_ATTEMPTS} frames`);
    }
  }, [cameraReady, isScanning]);

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#111111" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <ExpoStatusBar style="dark" />
        <Text style={styles.permissionTitle}>Alemeno Marker Scanner</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>Marker 1 Scanner</Text>
          <Text style={styles.subtitle}>{pictureSize} capture</Text>
        </View>
        <View style={styles.counter}>
          <Text style={styles.counterText}>{progress}</Text>
        </View>
      </View>

      <View style={styles.cameraShell}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          ratio="1:1"
          pictureSize={pictureSize}
          onCameraReady={onCameraReady}
        />
        <View pointerEvents="none" style={styles.reticle}>
          <View style={styles.reticleCornerTopLeft} />
          <View style={styles.reticleCornerTopRight} />
          <View style={styles.reticleCornerBottomLeft} />
          <View style={styles.reticleCornerBottomRight} />
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.primaryButton, (!cameraReady || isScanning) && styles.disabledButton]}
          onPress={startScan}
          disabled={!cameraReady || isScanning}
        >
          <Text style={styles.primaryButtonText}>{isScanning ? "Scanning" : "Scan 20 frames"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={isScanning ? stopScan : resetScan}>
          <Text style={styles.secondaryButtonText}>{isScanning ? "Stop" : "Reset"}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.sampleButton} onPress={loadSampleResults}>
        <Text style={styles.sampleButtonText}>Load 20 sample markers</Text>
      </TouchableOpacity>

      <View style={styles.statusRow}>
        <Text style={styles.statusText}>{lastMessage}</Text>
        <Text style={styles.statusText}>
          {attempts} frames{elapsedMs ? ` | ${elapsedMs} ms` : ""}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.results} horizontal={false}>
        {results.map((item, index) => (
          <View key={item.id} style={styles.resultItem}>
            <Image source={item.source || { uri: item.uri }} style={styles.resultImage} resizeMode="cover" />
            <Text style={styles.resultCaption}>
              #{index + 1} score {item.score} | {item.durationMs} ms
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#101211"
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7f7f2"
  },
  permissionScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    backgroundColor: "#f7f7f2",
    padding: 24
  },
  permissionTitle: {
    color: "#111111",
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center"
  },
  topBar: {
    minHeight: 74,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#101211"
  },
  title: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800"
  },
  subtitle: {
    color: "#cfd6d1",
    fontSize: 13,
    marginTop: 3
  },
  counter: {
    width: 72,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9f55f"
  },
  counterText: {
    color: "#101211",
    fontWeight: "900",
    fontSize: 17
  },
  cameraShell: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#000000",
    overflow: "hidden"
  },
  camera: {
    ...StyleSheet.absoluteFillObject
  },
  reticle: {
    ...StyleSheet.absoluteFillObject
  },
  reticleCornerTopLeft: {
    position: "absolute",
    left: "18%",
    top: "18%",
    width: 58,
    height: 58,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderColor: "#e9f55f"
  },
  reticleCornerTopRight: {
    position: "absolute",
    right: "18%",
    top: "18%",
    width: 58,
    height: 58,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderColor: "#e9f55f"
  },
  reticleCornerBottomLeft: {
    position: "absolute",
    left: "18%",
    bottom: "18%",
    width: 58,
    height: 58,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderColor: "#e9f55f"
  },
  reticleCornerBottomRight: {
    position: "absolute",
    right: "18%",
    bottom: "18%",
    width: 58,
    height: 58,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderColor: "#e9f55f"
  },
  controls: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9f55f"
  },
  primaryButtonText: {
    color: "#101211",
    fontWeight: "900",
    fontSize: 15
  },
  secondaryButton: {
    minHeight: 48,
    minWidth: 96,
    borderRadius: 8,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#5f6963"
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15
  },
  disabledButton: {
    opacity: 0.5
  },
  statusRow: {
    minHeight: 34,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  sampleButton: {
    minHeight: 42,
    marginHorizontal: 18,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff"
  },
  sampleButtonText: {
    color: "#101211",
    fontWeight: "900",
    fontSize: 14
  },
  statusText: {
    color: "#cfd6d1",
    fontSize: 12,
    flexShrink: 1
  },
  results: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 18
  },
  resultItem: {
    width: 300,
    alignItems: "center"
  },
  resultImage: {
    width: 300,
    height: 300,
    backgroundColor: "#ffffff"
  },
  resultCaption: {
    color: "#cfd6d1",
    fontSize: 12,
    marginTop: 6
  }
});
