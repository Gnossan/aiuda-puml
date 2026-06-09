#!/usr/bin/env bash
# Bygger en minimal JRE för PlantUML med jlink.
# Kör en gång: bash scripts/build-jre.sh
# Output: resources/jre/  (~50 MB)

set -e

JAVA_HOME="/opt/homebrew/opt/openjdk"
JDEPS="$JAVA_HOME/bin/jdeps"
JLINK="$JAVA_HOME/bin/jlink"
JAR="$(dirname "$0")/../resources/plantuml.jar"
OUT="$(dirname "$0")/../resources/jre"

if [ ! -f "$JAR" ]; then
    echo "Fel: plantuml.jar saknas på $JAR"
    exit 1
fi

echo "→ Analyserar PlantUML-moduler med jdeps …"
MODULER=$("$JDEPS" \
    --ignore-missing-deps \
    --print-module-deps \
    --multi-release 21 \
    "$JAR" 2>/dev/null)

# PlantUML behöver även dessa för SVG/bildrendering
EXTRA="java.desktop,java.xml,java.naming"
ALLA=$(echo "$MODULER,$EXTRA" | tr ',' '\n' | sort -u | tr '\n' ',' | sed 's/,$//')

echo "→ Moduler: $ALLA"
echo "→ Bygger JRE med jlink …"

rm -rf "$OUT"
"$JLINK" \
    --module-path "$JAVA_HOME/jmods" \
    --add-modules "$ALLA" \
    --strip-debug \
    --no-man-pages \
    --no-header-files \
    --compress=2 \
    --output "$OUT"

echo "✓ JRE byggd: $OUT"
du -sh "$OUT"
"$OUT/bin/java" -version
