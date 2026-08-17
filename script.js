/* =============================================================
   DIGITAL TWIN BUILDING MONITOR — script.js
   CE Project 1 Prototype

   Progress so far:
     [x] Scene / camera / renderer                  (Stage 1)
     [x] Lighting                                    (Stage 1)
     [x] OrbitControls (rotate / pan / zoom)          (Stage 1)
     [x] 6 m x 6 m building built from separate,
         named meshes                                (Stage 1)
     [x] Raycasting / component selection             (Stage 2)
     [x] Highlight effect on selection                (Stage 2)
     [x] Information panel                            (Stage 3)
     [x] Measurement line visualization               (Stage 4)
     [x] Component inspection / isolation mode        (post-Stage 4 add-on)
     [ ] UI polish                             <-- Stage 5 (not started)

   POST-STAGE-4 ADD-ON (this update): an "Inspect Component" action in
   the info panel that hides every other component, flies the camera
   in to frame the selected one, and adds a "Return to Building"
   button that restores everything exactly as it was. This reuses the
   existing selectableComponents array and mesh.userData.componentData
   — no new geometry, no second model, nothing hardcoded per component.
============================================================= */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* -------------------------------------------------------------
   1. SAMPLE BUILDING DATA
   -------------------------------------------------------------
   This is placeholder / sample data for the CE Project 1 prototype.
   Every measurement here is made up (but realistic) — nothing is
   coming from a real scan yet.

   In CE Project 2, this array will be replaced by data produced by
   a Python/Open3D backend after processing an RTAB-Map 3D scan.
   As long as the replacement data follows the same shape (id, type,
   name, dimensions, position, rotation), none of the mesh-building
   code below needs to change. That is the whole point of keeping
   this list separate from the Three.js code.
------------------------------------------------------------- */

// Overall building dimensions, used both for geometry and for the
// future "nothing selected" view of the information panel (Stage 2).
const BUILDING_OVERVIEW = {
  buildingType: "Prototype Prefabricated House",
  overallWidth: 6.0, // meters, along X axis
  overallLength: 6.0, // meters, along Z axis
  wallHeight: 3.0, // meters
};

const WALL_THICKNESS = 0.15; // meters

// Half-extents, used repeatedly when placing components.
const HALF_WIDTH = BUILDING_OVERVIEW.overallWidth / 2; // 3.0
const HALF_LENGTH = BUILDING_OVERVIEW.overallLength / 2; // 3.0
const HALF_THICKNESS = WALL_THICKNESS / 2; // 0.075

// Each entry below fully describes ONE building component:
//   id       -> unique string, will be used for lookups later
//   type     -> "floor" | "wall" | "roof" | "door" | "window"
//   name     -> human-readable label shown in the future info panel
//   size     -> { x, y, z } box dimensions in meters
//   position -> { x, y, z } center of the box in world space
//   data     -> the measurement fields Stage 2's info panel will read
const SAMPLE_BUILDING_DATA = [
  {
    id: "floor",
    type: "floor",
    name: "Floor Slab",
    size: { x: BUILDING_OVERVIEW.overallWidth, y: 0.1, z: BUILDING_OVERVIEW.overallLength },
    position: { x: 0, y: -0.05, z: 0 },
    data: {
      length: BUILDING_OVERVIEW.overallLength,
      width: BUILDING_OVERVIEW.overallWidth,
      area: BUILDING_OVERVIEW.overallLength * BUILDING_OVERVIEW.overallWidth,
    },
  },
  {
    id: "north-wall",
    type: "wall",
    name: "North Wall",
    size: { x: BUILDING_OVERVIEW.overallWidth, y: BUILDING_OVERVIEW.wallHeight, z: WALL_THICKNESS },
    position: { x: 0, y: BUILDING_OVERVIEW.wallHeight / 2, z: -HALF_LENGTH + HALF_THICKNESS },
    data: {
      length: BUILDING_OVERVIEW.overallWidth,
      height: BUILDING_OVERVIEW.wallHeight,
      thickness: WALL_THICKNESS,
      area: BUILDING_OVERVIEW.overallWidth * BUILDING_OVERVIEW.wallHeight,
    },
  },
  {
    id: "south-wall",
    type: "wall",
    name: "South Wall",
    size: { x: BUILDING_OVERVIEW.overallWidth, y: BUILDING_OVERVIEW.wallHeight, z: WALL_THICKNESS },
    position: { x: 0, y: BUILDING_OVERVIEW.wallHeight / 2, z: HALF_LENGTH - HALF_THICKNESS },
    data: {
      length: BUILDING_OVERVIEW.overallWidth,
      height: BUILDING_OVERVIEW.wallHeight,
      thickness: WALL_THICKNESS,
      area: BUILDING_OVERVIEW.overallWidth * BUILDING_OVERVIEW.wallHeight,
    },
  },
  {
    id: "east-wall",
    type: "wall",
    name: "East Wall",
    size: { x: WALL_THICKNESS, y: BUILDING_OVERVIEW.wallHeight, z: BUILDING_OVERVIEW.overallLength },
    position: { x: HALF_WIDTH - HALF_THICKNESS, y: BUILDING_OVERVIEW.wallHeight / 2, z: 0 },
    data: {
      length: BUILDING_OVERVIEW.overallLength,
      height: BUILDING_OVERVIEW.wallHeight,
      thickness: WALL_THICKNESS,
      area: BUILDING_OVERVIEW.overallLength * BUILDING_OVERVIEW.wallHeight,
    },
  },
  {
    id: "west-wall",
    type: "wall",
    name: "West Wall",
    size: { x: WALL_THICKNESS, y: BUILDING_OVERVIEW.wallHeight, z: BUILDING_OVERVIEW.overallLength },
    position: { x: -HALF_WIDTH + HALF_THICKNESS, y: BUILDING_OVERVIEW.wallHeight / 2, z: 0 },
    data: {
      length: BUILDING_OVERVIEW.overallLength,
      height: BUILDING_OVERVIEW.wallHeight,
      thickness: WALL_THICKNESS,
      area: BUILDING_OVERVIEW.overallLength * BUILDING_OVERVIEW.wallHeight,
    },
  },
  {
    id: "roof",
    type: "roof",
    name: "Roof Slab",
    // Slightly larger than the footprint so it overhangs the walls a little, like a real eave.
    size: { x: BUILDING_OVERVIEW.overallWidth + 0.3, y: 0.2, z: BUILDING_OVERVIEW.overallLength + 0.3 },
    position: { x: 0, y: BUILDING_OVERVIEW.wallHeight + 0.1, z: 0 },
    data: {
      length: BUILDING_OVERVIEW.overallLength,
      width: BUILDING_OVERVIEW.overallWidth,
      area: BUILDING_OVERVIEW.overallLength * BUILDING_OVERVIEW.overallWidth,
    },
  },
  {
    id: "front-door",
    type: "door",
    name: "Front Door",
    size: { x: 1.0, y: 2.1, z: WALL_THICKNESS + 0.03 },
    // Set into the south wall, offset toward one side.
    position: { x: -1.5, y: 2.1 / 2, z: HALF_LENGTH - HALF_THICKNESS },
    data: {
      width: 1.0,
      height: 2.1,
      area: 1.0 * 2.1,
    },
  },
  {
    id: "window-east",
    type: "window",
    name: "East Window",
    size: { x: WALL_THICKNESS + 0.03, y: 1.2, z: 1.2 },
    // Sill height 0.9 m, so the window's vertical center sits at 0.9 + 1.2/2 = 1.5 m.
    position: { x: HALF_WIDTH - HALF_THICKNESS, y: 1.5, z: 0 },
    data: {
      width: 1.2,
      height: 1.2,
      area: 1.2 * 1.2,
    },
  },
  {
    id: "window-west",
    type: "window",
    name: "West Window",
    size: { x: WALL_THICKNESS + 0.03, y: 1.2, z: 1.2 },
    position: { x: -HALF_WIDTH + HALF_THICKNESS, y: 1.5, z: 0 },
    data: {
      width: 1.2,
      height: 1.2,
      area: 1.2 * 1.2,
    },
  },
];

/* -------------------------------------------------------------
   2. MATERIALS
   -------------------------------------------------------------
   One material per component type, so the building reads clearly
   at a glance (walls vs. roof vs. openings). Kept in one place so
   Stage 2 can reuse these same materials when un-highlighting a
   component (i.e. "restore to this original material").
------------------------------------------------------------- */
const MATERIALS = {
  floor: new THREE.MeshStandardMaterial({ color: 0x3a4256, roughness: 0.9, metalness: 0.05 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x2c3852, roughness: 0.85, metalness: 0.05 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x1c2438, roughness: 0.8, metalness: 0.1 }),
  door: new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.6, metalness: 0.1 }),
  window: new THREE.MeshStandardMaterial({
    color: 0x4fd1c5,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.55,
  }),
};

/* -------------------------------------------------------------
   3. SCENE / CAMERA / RENDERER
------------------------------------------------------------- */

const viewportElement = document.getElementById("viewport");
const canvasElement = document.getElementById("scene-canvas");

// The scene is the container that holds every 3D object.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 18, 40); // subtle depth fade, matches the dark theme

// The camera defines what we see. 50deg field of view feels natural for an
// architectural walkthrough (not too wide/fisheye, not too flat/telephoto).
const camera = new THREE.PerspectiveCamera(
  50,
  viewportElement.clientWidth / viewportElement.clientHeight,
  0.1,
  1000
);
// Start from a three-quarter / isometric-style angle, a good default view
// for showing off a whole small building at once.
camera.position.set(9, 7, 9);

// The renderer draws the scene + camera onto our canvas every frame.
const renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
renderer.setSize(viewportElement.clientWidth, viewportElement.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* -------------------------------------------------------------
   4. ORBIT CONTROLS
   -------------------------------------------------------------
   Lets the user rotate (left-drag), pan (right-drag / two-finger),
   and zoom (scroll / pinch) around the building.
------------------------------------------------------------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0); // look roughly at the building's mid-height, not the ground
controls.enableDamping = true; // smooth, "weighted" camera movement
controls.dampingFactor = 0.08;
controls.minDistance = 3; // don't let the user zoom inside the walls
controls.maxDistance = 25; // don't let the building shrink to a speck
controls.maxPolarAngle = Math.PI / 2 - 0.02; // stop the camera just short of going underground
controls.update();

/* -------------------------------------------------------------
   5. LIGHTING
   -------------------------------------------------------------
   A three-point-ish setup: a soft sky/ground fill plus one strong
   "sun" light that casts shadows, so the building has real shape
   and depth instead of looking flat.
------------------------------------------------------------- */

// Soft light from the "sky" (bluish) and "ground" (dark) — fills in shadows gently.
const hemisphereLight = new THREE.HemisphereLight(0x9fb8ff, 0x1a1f2e, 0.6);
scene.add(hemisphereLight);

// Low-level ambient light so no surface is ever fully black.
const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambientLight);

// Main directional "sun" light, casts shadows.
const sunLight = new THREE.DirectionalLight(0xfff2e0, 1.4);
sunLight.position.set(10, 14, 8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 40;
sunLight.shadow.camera.left = -10;
sunLight.shadow.camera.right = 10;
sunLight.shadow.camera.top = 10;
sunLight.shadow.camera.bottom = -10;
sunLight.shadow.bias = -0.0015;
scene.add(sunLight);

/* -------------------------------------------------------------
   6. BUILD THE BUILDING FROM SAMPLE_BUILDING_DATA
   -------------------------------------------------------------
   createComponentMesh() turns ONE data entry into ONE Three.js
   mesh. Because every component is its own mesh (not merged into
   one big shape), Stage 2 will be able to raycast and highlight
   them individually.
------------------------------------------------------------- */

// This group holds every building component, so we can move / show / hide
// the whole building at once later if needed.
const buildingGroup = new THREE.Group();
buildingGroup.name = "building";
scene.add(buildingGroup);

// Keep a flat list of the meshes we create. Stage 2's raycaster will loop
// over this array to test for clicks, instead of walking the whole scene.
const selectableComponents = [];

function createComponentMesh(componentSpec) {
  const geometry = new THREE.BoxGeometry(
    componentSpec.size.x,
    componentSpec.size.y,
    componentSpec.size.z
  );

  // IMPORTANT: .clone() the shared material so each component gets its OWN
  // material instance. All walls start out looking identical (same color),
  // but because each one has its own material object, we can safely light
  // up ONE wall's emissive glow later without accidentally lighting up
  // every other wall that shares the same base material.
  const material = MATERIALS[componentSpec.type].clone();
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(
    componentSpec.position.x,
    componentSpec.position.y,
    componentSpec.position.z
  );

  mesh.name = componentSpec.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Store the component's data on the mesh itself. The Stage 3 info panel
  // will read `mesh.userData.componentData` once a component is clicked.
  mesh.userData.componentData = {
    id: componentSpec.id,
    type: componentSpec.type,
    name: componentSpec.name,
    ...componentSpec.data,
  };

  // Remember this mesh's "resting" (non-highlighted) emissive glow so the
  // highlight function can restore it exactly when the component is
  // deselected, instead of guessing a default value.
  mesh.userData.restingEmissive = material.emissive.clone();
  mesh.userData.restingEmissiveIntensity = material.emissiveIntensity;

  return mesh;
}

// Build every component described in SAMPLE_BUILDING_DATA.
SAMPLE_BUILDING_DATA.forEach((componentSpec) => {
  const mesh = createComponentMesh(componentSpec);
  buildingGroup.add(mesh);
  selectableComponents.push(mesh);
});

/* -------------------------------------------------------------
   7. GROUND GRID (for scale reference only, not part of the building)
------------------------------------------------------------- */
const groundGrid = new THREE.GridHelper(20, 20, 0x2c3852, 0x18213a);
groundGrid.position.y = -0.11; // just below the floor slab so it doesn't z-fight
scene.add(groundGrid);

/* -------------------------------------------------------------
   8. RESPONSIVE RESIZE
   -------------------------------------------------------------
   Keeps the render resolution and camera aspect ratio matched to
   the viewport element's actual on-screen size.
------------------------------------------------------------- */
function handleResize() {
  const width = viewportElement.clientWidth;
  const height = viewportElement.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
}
window.addEventListener("resize", handleResize);

/* -------------------------------------------------------------
   9. RENDER LOOP
------------------------------------------------------------- */
function animate() {
  requestAnimationFrame(animate);

  updateCameraTransition(); // smoothly flies the camera in/out for Inspection Mode
  controls.update(); // required every frame because enableDamping is true

  renderer.render(scene, camera);
}
// NOTE: animate() is not started here. It depends on state declared later
// in this file (Section 13's camera-transition variables), so starting it
// here would run that code before those variables exist. The actual
// `animate();` call that kicks off the render loop is at the very bottom
// of the file, after every section has finished initializing.

/* =============================================================
   10. COMPONENT SELECTION (Stage 2)
   -------------------------------------------------------------
   How this works, in order:

   1. When the user presses AND releases the mouse in roughly the
      same spot (a "click", not a camera-rotate drag), we convert
      that screen position into normalized device coordinates
      (-1 to +1 on each axis).
   2. THREE.Raycaster shoots an invisible ray from the camera,
      through that screen point, into the 3D scene.
   3. raycaster.intersectObjects() tells us every component mesh
      that ray passed through, ordered nearest-first. The nearest
      one is what the user actually clicked on.
   4. We highlight that mesh and remove the highlight from whatever
      was previously selected.
============================================================= */

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(); // pointer position in Normalized Device Coordinates

// Colors used purely for the highlight effect (not stored as component data).
const HIGHLIGHT_EMISSIVE = new THREE.Color(0xf2a65a); // warm amber glow
const HIGHLIGHT_OUTLINE_COLOR = 0xf2a65a;

let selectedMesh = null; // the currently selected component, or null if none
let highlightOutline = null; // the wireframe box drawn around the selected component

/**
 * Applies the highlight look (emissive glow) to a mesh.
 */
function applyHighlight(mesh) {
  mesh.material.emissive.set(HIGHLIGHT_EMISSIVE);
  mesh.material.emissiveIntensity = 0.85;
}

/**
 * Restores a mesh's material to the way it looked before it was selected.
 */
function removeHighlight(mesh) {
  mesh.material.emissive.copy(mesh.userData.restingEmissive);
  mesh.material.emissiveIntensity = mesh.userData.restingEmissiveIntensity;
}

/**
 * Selects a new component: un-highlights the previous selection (if any),
 * highlights the new one, and draws a wireframe outline box around it so
 * the selection is clearly visible from any camera angle.
 */
function selectComponent(mesh) {
  if (selectedMesh === mesh) return; // already selected, nothing to do

  clearSelection();

  selectedMesh = mesh;
  applyHighlight(mesh);

  // BoxHelper draws a wireframe box that exactly matches the mesh's
  // current bounding box — an easy, reliable way to frame the selection.
  highlightOutline = new THREE.BoxHelper(mesh, HIGHLIGHT_OUTLINE_COLOR);
  scene.add(highlightOutline);

  // Update the right-side info panel with this component's data.
  showComponentInfo(mesh.userData.componentData);

  // Draw dimension lines/labels around this component in the 3D view.
  showMeasurementsForComponent(mesh);

  updateActionButtons();
}

/**
 * Deselects whatever is currently selected (used when the user clicks
 * empty space, or right before selecting something new).
 */
function clearSelection() {
  if (selectedMesh) {
    removeHighlight(selectedMesh);
    selectedMesh = null;
  }
  if (highlightOutline) {
    scene.remove(highlightOutline);
    highlightOutline.dispose();
    highlightOutline = null;
  }

  clearMeasurements();

  // With nothing selected, the panel falls back to the building overview.
  showBuildingOverview();

  updateActionButtons();
}

/**
 * Runs the actual raycast at a given screen position (in CSS pixels,
 * e.g. from a mouse event's clientX/clientY) and selects whatever
 * building component is under that point, if any.
 */
function pickComponentAtScreenPosition(clientX, clientY) {
  const canvasBounds = canvasElement.getBoundingClientRect();

  // Convert screen pixel coordinates to Normalized Device Coordinates,
  // where (0,0) is the center of the canvas, (-1,-1) is bottom-left,
  // and (1,1) is top-right — the format THREE.Raycaster expects.
  pointerNDC.x = ((clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
  pointerNDC.y = -((clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;

  raycaster.setFromCamera(pointerNDC, camera);

  // While Inspection Mode is active, every other component is hidden, so
  // there's nothing meaningful to click except the isolated component
  // itself. Restricting the raycast target list (instead of relying on
  // visibility alone) keeps this explicit and avoids any chance of
  // clicking "through" to a hidden mesh.
  const raycastTargets = inInspectionMode ? [selectedMesh] : selectableComponents;

  // `false` = don't check descendants recursively; our meshes have none.
  const intersections = raycaster.intersectObjects(raycastTargets, false);

  if (intersections.length > 0) {
    const closestHit = intersections[0]; // nearest object along the ray
    selectComponent(closestHit.object);
  } else if (!inInspectionMode) {
    // Clicking empty space (or the sky) deselects — but only outside
    // Inspection Mode. While inspecting, only "Return to Building" exits.
    clearSelection();
  }
}

/* -------------------------------------------------------------
   Click detection: we distinguish a real "click" from a
   camera-rotate drag by checking how far the pointer moved
   between mousedown and mouseup. OrbitControls needs to keep
   receiving drag events uninterrupted, so we only ever READ
   pointer positions here — we never call preventDefault() or
   stopPropagation().
------------------------------------------------------------- */
const CLICK_DRAG_THRESHOLD_PX = 5; // movement below this = treated as a click
let pointerDownPosition = { x: 0, y: 0 };

canvasElement.addEventListener("pointerdown", (event) => {
  pointerDownPosition = { x: event.clientX, y: event.clientY };
});

canvasElement.addEventListener("pointerup", (event) => {
  const deltaX = event.clientX - pointerDownPosition.x;
  const deltaY = event.clientY - pointerDownPosition.y;
  const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (dragDistance < CLICK_DRAG_THRESHOLD_PX) {
    pickComponentAtScreenPosition(event.clientX, event.clientY);
  }
});

/* =============================================================
   11. INFORMATION PANEL (Stage 3)
   -------------------------------------------------------------
   Two views, both rendered into the same #panel-content element:

   - showBuildingOverview() : the default view, shown when nothing
     is selected. Its three fields come from BUILDING_OVERVIEW,
     the same overall-dimensions object used to build the geometry.

   - showComponentInfo(componentData) : shown after a click.
     IMPORTANT — this function does NOT know in advance whether it's
     describing a wall, a door, or a window. It just loops over
     whatever fields exist in the component's own `data` object
     (length, height, thickness, area, width...) and renders one
     row per field. That's what "data comes from the component's
     data object, not hardcoded per type" means in practice: add a
     new field to SAMPLE_BUILDING_DATA and it shows up here with no
     changes to this function.
============================================================= */

const panelEyebrow = document.getElementById("panel-eyebrow");
const panelTitle = document.getElementById("panel-title");
const panelContent = document.getElementById("panel-content");
const panelHint = document.getElementById("panel-hint");

// Fields we never want printed as a generic row, either because they're
// identifiers rather than measurements (id, type, name) or because the
// overview function already displays them by hand.
const NON_MEASUREMENT_FIELDS = ["id", "type", "name"];

/**
 * Turns a data object's key (e.g. "wallHeight") into a readable label
 * (e.g. "Wall Height"), by splitting camelCase words and capitalizing.
 */
function formatFieldLabel(fieldKey) {
  const withSpaces = fieldKey.replace(/([A-Z])/g, " $1"); // wallHeight -> wall Height
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1); // -> Wall Height
}

/**
 * Formats a numeric measurement with the right unit: square meters for
 * any field named/ending in "area", plain meters for everything else.
 */
function formatFieldValue(fieldKey, value) {
  if (typeof value !== "number") return String(value);
  const unit = fieldKey.toLowerCase().includes("area") ? "m\u00B2" : "m";
  return `${value.toFixed(2)} ${unit}`;
}

/**
 * Renders an array of { label, value } pairs into #panel-content.
 * Both the overview and the component view use this same renderer.
 */
function renderPanelRows(rows) {
  panelContent.innerHTML = ""; // clear whatever was shown before

  rows.forEach((row) => {
    const rowElement = document.createElement("div");
    rowElement.className = "panel-row";

    const labelElement = document.createElement("span");
    labelElement.className = "panel-row-label";
    labelElement.textContent = row.label;

    const valueElement = document.createElement("span");
    valueElement.className = "panel-row-value";
    valueElement.textContent = row.value;

    rowElement.appendChild(labelElement);
    rowElement.appendChild(valueElement);
    panelContent.appendChild(rowElement);
  });
}

/**
 * Default panel view: shown on page load and whenever nothing is selected.
 */
function showBuildingOverview() {
  panelEyebrow.textContent = "Overview";
  panelTitle.textContent = "Building Information";
  panelHint.textContent = "Click a building component to view its measurements.";

  renderPanelRows([
    { label: "Building Type", value: BUILDING_OVERVIEW.buildingType },
    {
      label: "Overall Dimensions",
      value: `${BUILDING_OVERVIEW.overallWidth.toFixed(2)} m \u00D7 ${BUILDING_OVERVIEW.overallLength.toFixed(2)} m`,
    },
    { label: "Wall Height", value: `${BUILDING_OVERVIEW.wallHeight.toFixed(2)} m` },
  ]);
}

/**
 * Component panel view: shown after a wall/floor/roof/door/window is clicked.
 * `componentData` is exactly mesh.userData.componentData — nothing here is
 * re-typed or hardcoded per component; it's read straight from that object.
 */
function showComponentInfo(componentData) {
  panelEyebrow.textContent = componentData.type.toUpperCase();
  panelTitle.textContent = componentData.name;
  panelHint.textContent = "Click another component, or click empty space to deselect.";

  const rows = Object.keys(componentData)
    .filter((fieldKey) => !NON_MEASUREMENT_FIELDS.includes(fieldKey))
    .map((fieldKey) => ({
      label: formatFieldLabel(fieldKey),
      value: formatFieldValue(fieldKey, componentData[fieldKey]),
    }));

  renderPanelRows(rows);
}

// Show the building overview immediately on page load, before anything
// has been clicked.
showBuildingOverview();

/* =============================================================
   12. MEASUREMENT VISUALIZATION (Stage 4)
   -------------------------------------------------------------
   Draws simple architectural-style dimension lines around the
   currently selected component: a line offset away from the
   component, short "witness" lines connecting it back to the
   component's actual edges, and a text label showing the value.

   None of the drawing code below contains actual measurements —
   every number it draws comes from mesh.userData.componentData
   (via getDimensionSpecs). All this code knows how to do is take
   whatever axis + value it's given and turn it into a line.
============================================================= */

const DIMENSION_OFFSET = 0.4; // meters, how far the dimension line floats off the surface
const DIMENSION_LABEL_GAP = 0.16; // extra meters between the line and its text label
const MEASUREMENT_COLOR = 0x4fd1c5; // teal, matches the app's accent color

// Holds every dimension-line/label object currently drawn, so we can
// remove them cleanly the moment the selection changes.
const measurementGroup = new THREE.Group();
measurementGroup.name = "measurements";
scene.add(measurementGroup);

/**
 * Reads a mesh's own BoxGeometry parameters to get its half-width,
 * half-height, and half-depth in meters (BoxGeometry stores these
 * directly, so no manual bounding-box math is needed).
 */
function getMeshHalfExtents(mesh) {
  const params = mesh.geometry.parameters;
  return { x: params.width / 2, y: params.height / 2, z: params.depth / 2 };
}

/**
 * Decides WHICH dimensions to draw for a given component, and reads
 * their displayed VALUES straight from mesh.userData.componentData.
 * The geometry itself is only used to figure out which world axis
 * (x or z) a wall/door/window happens to run along.
 */
function getDimensionSpecs(mesh) {
  const data = mesh.userData.componentData;
  const params = mesh.geometry.parameters;

  if (data.type === "floor" || data.type === "roof") {
    // Thin horizontal slabs: show both plan-view dimensions.
    return [
      { kind: "span", axis: "x", valueMeters: data.width },
      { kind: "span", axis: "z", valueMeters: data.length },
    ];
  }

  // wall / door / window: all are boxes where one horizontal axis is
  // "thin" (the wall thickness) and the other is the actual span. We
  // detect which is which from the geometry rather than assuming X or Z,
  // since e.g. north/south walls run along X but east/west walls run
  // along Z.
  const horizontalAxis = params.width >= params.depth ? "x" : "z";
  const horizontalValue = data.type === "wall" ? data.length : data.width;

  return [
    { kind: "span", axis: horizontalAxis, valueMeters: horizontalValue },
    { kind: "height", axis: horizontalAxis, valueMeters: data.height },
  ];
}

/**
 * Builds one horizontal dimension line (for a wall's length, a
 * window's width, a floor's width/length, etc.) running along the
 * given axis ("x" or "z"), floating just above the component's top.
 */
function buildSpanDimension(mesh, axis, valueMeters) {
  const half = getMeshHalfExtents(mesh);
  const center = mesh.position;
  const topY = center.y + half.y;
  const lineY = topY + DIMENSION_OFFSET;

  let edgeStart, edgeEnd, lineStart, lineEnd;

  if (axis === "x") {
    edgeStart = new THREE.Vector3(center.x - half.x, topY, center.z);
    edgeEnd = new THREE.Vector3(center.x + half.x, topY, center.z);
    lineStart = new THREE.Vector3(center.x - half.x, lineY, center.z);
    lineEnd = new THREE.Vector3(center.x + half.x, lineY, center.z);
  } else {
    edgeStart = new THREE.Vector3(center.x, topY, center.z - half.z);
    edgeEnd = new THREE.Vector3(center.x, topY, center.z + half.z);
    lineStart = new THREE.Vector3(center.x, lineY, center.z - half.z);
    lineEnd = new THREE.Vector3(center.x, lineY, center.z + half.z);
  }

  addDimensionVisual(edgeStart, edgeEnd, lineStart, lineEnd, valueMeters);
}

/**
 * Builds one vertical dimension line (a wall/door/window's height),
 * floating just past the component's edge along whichever horizontal
 * axis it runs along, so it doesn't overlap the span dimension above.
 */
function buildHeightDimension(mesh, axis, valueMeters) {
  const half = getMeshHalfExtents(mesh);
  const center = mesh.position;
  const bottomY = center.y - half.y;
  const topY = center.y + half.y;

  let edgeStart, edgeEnd, lineStart, lineEnd;

  if (axis === "x") {
    const edgeCoord = center.x + half.x;
    const lineCoord = edgeCoord + DIMENSION_OFFSET;
    edgeStart = new THREE.Vector3(edgeCoord, bottomY, center.z);
    edgeEnd = new THREE.Vector3(edgeCoord, topY, center.z);
    lineStart = new THREE.Vector3(lineCoord, bottomY, center.z);
    lineEnd = new THREE.Vector3(lineCoord, topY, center.z);
  } else {
    const edgeCoord = center.z + half.z;
    const lineCoord = edgeCoord + DIMENSION_OFFSET;
    edgeStart = new THREE.Vector3(center.x, bottomY, edgeCoord);
    edgeEnd = new THREE.Vector3(center.x, topY, edgeCoord);
    lineStart = new THREE.Vector3(center.x, bottomY, lineCoord);
    lineEnd = new THREE.Vector3(center.x, topY, lineCoord);
  }

  addDimensionVisual(edgeStart, edgeEnd, lineStart, lineEnd, valueMeters);
}

/**
 * Adds the actual Three.js objects for one dimension: two short witness
 * lines (connecting the component's real edges to the floating dimension
 * line), the dimension line itself, and a text label at its midpoint.
 */
function addDimensionVisual(edgeStart, edgeEnd, lineStart, lineEnd, valueMeters) {
  measurementGroup.add(makeMeasurementLine([edgeStart, lineStart]));
  measurementGroup.add(makeMeasurementLine([edgeEnd, lineEnd]));
  measurementGroup.add(makeMeasurementLine([lineStart, lineEnd]));

  const midpoint = lineStart.clone().add(lineEnd).multiplyScalar(0.5);
  const offsetDirection = lineStart.clone().sub(edgeStart).normalize();
  const labelPosition = midpoint.add(offsetDirection.multiplyScalar(DIMENSION_LABEL_GAP));

  measurementGroup.add(createMeasurementLabel(`${valueMeters.toFixed(2)} m`, labelPosition));
}

function makeMeasurementLine(points) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: MEASUREMENT_COLOR });
  return new THREE.Line(geometry, material);
}

/**
 * Builds a small floating text label (a camera-facing sprite drawn from
 * an offscreen canvas) showing a measurement value, e.g. "6.00 m".
 */
function createMeasurementLabel(text, position) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  const fontSize = 46;
  context.font = `600 ${fontSize}px "IBM Plex Mono", monospace`;
  const textWidth = context.measureText(text).width;

  const paddingX = 22;
  const paddingY = 14;
  canvas.width = textWidth + paddingX * 2;
  canvas.height = fontSize + paddingY * 2;

  // Resizing a canvas clears its context state, so the font must be set again.
  context.font = `600 ${fontSize}px "IBM Plex Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  // Dark pill background with a teal border, matching the app's theme.
  context.fillStyle = "rgba(11, 18, 32, 0.88)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#4fd1c5";
  context.lineWidth = 2;
  context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

  context.fillStyle = "#e7ecf3";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);

  // Scale the sprite from canvas pixels down to a sensible real-world size.
  const worldUnitsPerPixel = 0.0035;
  sprite.scale.set(canvas.width * worldUnitsPerPixel, canvas.height * worldUnitsPerPixel, 1);
  sprite.position.copy(position);
  sprite.renderOrder = 999; // draw labels after everything else, so they stay legible

  return sprite;
}

/**
 * Clears every dimension line/label currently shown, and frees their
 * GPU resources (geometries, materials, canvas textures).
 */
function clearMeasurements() {
  measurementGroup.children.forEach((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
  });
  measurementGroup.clear();
}

/**
 * Draws all dimension lines/labels for the given (just-selected) mesh.
 */
function showMeasurementsForComponent(mesh) {
  clearMeasurements();

  const dimensionSpecs = getDimensionSpecs(mesh);
  dimensionSpecs.forEach((spec) => {
    if (spec.kind === "span") {
      buildSpanDimension(mesh, spec.axis, spec.valueMeters);
    } else {
      buildHeightDimension(mesh, spec.axis, spec.valueMeters);
    }
  });
}

/* =============================================================
   13. COMPONENT INSPECTION / ISOLATION MODE
   -------------------------------------------------------------
   Lets the user isolate the currently selected component: every
   other component is hidden, the camera flies in to frame just
   that one component, and a "Return to Building" button reverses
   all of it exactly.

   Nothing here duplicates geometry or creates a second model —
   it only toggles `mesh.visible` on the SAME meshes already in
   `selectableComponents`, and reads sizing from the SAME
   `mesh.userData.componentData` the info panel and dimension
   lines already use. It works for any component because it never
   checks a specific id/name — only the mesh's own geometry.
============================================================= */

const inspectButton = document.getElementById("inspect-button");
const returnButton = document.getElementById("return-button");

let inInspectionMode = false;

// Captured the instant Inspection Mode is entered, so Return to Building
// can put the camera back exactly where the user had it before.
let cameraStateBeforeInspection = null;

// The OrbitControls zoom-distance limits are tuned for viewing the whole
// building (Section 4). We temporarily loosen them while inspecting a
// single component, then restore these exact values afterward.
let orbitLimitsBeforeInspection = null;

// Whatever the info panel's hint line said right before we overwrote it
// with inspection-specific instructions.
let panelHintBeforeInspection = null;

/**
 * Shows/hides the "Inspect Component" and "Return to Building" buttons
 * based on the current selection + inspection state. Called any time
 * either of those states changes.
 */
function updateActionButtons() {
  const hasSelection = selectedMesh !== null;
  inspectButton.hidden = !hasSelection || inInspectionMode;
  returnButton.hidden = !inInspectionMode;
}

/**
 * Enters Inspection Mode for the given mesh: hides every other
 * component, moves the camera to frame this one, and swaps in the
 * "Return to Building" button. The selection, highlight, info panel,
 * and dimension lines from Stages 2-4 are left completely alone —
 * they already belong to this mesh and keep working normally.
 */
function enterInspectionMode(mesh) {
  if (inInspectionMode || !mesh) return;
  inInspectionMode = true;

  // Remember exactly where the camera and controls were, so we can put
  // them back precisely when the user returns.
  cameraStateBeforeInspection = {
    position: camera.position.clone(),
    target: controls.target.clone(),
  };
  orbitLimitsBeforeInspection = {
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
  };
  panelHintBeforeInspection = panelHint.textContent;

  // Hide every OTHER selectable component. The selected mesh itself is
  // simply skipped, so it (and its existing highlight + outline) stays
  // fully visible exactly as Stage 2 already set it up.
  selectableComponents.forEach((componentMesh) => {
    if (componentMesh !== mesh) {
      componentMesh.visible = false;
    }
  });
  groundGrid.visible = false; // hide the scale-reference grid too, for a cleaner isolated view

  flyCameraToComponent(mesh);

  panelHint.textContent = "Inspecting this component. Click \u201cReturn to Building\u201d to exit.";

  updateActionButtons();
}

/**
 * Exits Inspection Mode: restores every component's visibility, restores
 * the orbit-distance limits, and flies the camera back to wherever it
 * was before Inspect Component was clicked. The current selection is
 * left as-is — the user is simply looking at the whole building again
 * with the same component still selected.
 */
function exitInspectionMode() {
  if (!inInspectionMode) return;
  inInspectionMode = false;

  selectableComponents.forEach((componentMesh) => {
    componentMesh.visible = true;
  });
  groundGrid.visible = true;

  if (orbitLimitsBeforeInspection) {
    controls.minDistance = orbitLimitsBeforeInspection.minDistance;
    controls.maxDistance = orbitLimitsBeforeInspection.maxDistance;
    orbitLimitsBeforeInspection = null;
  }

  if (cameraStateBeforeInspection) {
    startCameraTransition(cameraStateBeforeInspection.position, cameraStateBeforeInspection.target);
    cameraStateBeforeInspection = null;
  }

  if (panelHintBeforeInspection !== null) {
    panelHint.textContent = panelHintBeforeInspection;
    panelHintBeforeInspection = null;
  }

  updateActionButtons();
}

/**
 * Figures out a good camera position to frame `mesh` and starts a
 * smooth transition toward it. The distance is based on the component's
 * OWN size (from its geometry), so a small window gets a close-up and a
 * whole wall gets a wider view, automatically.
 */
function flyCameraToComponent(mesh) {
  const boundingBox = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  boundingBox.getSize(size);
  boundingBox.getCenter(center);

  const largestDimension = Math.max(size.x, size.y, size.z);
  const viewDistance = Math.max(largestDimension * 2.0, 1.6) + 0.8;

  // A fixed three-quarter, slightly elevated viewing direction — the same
  // kind of angle the app opens with, just close up on one component.
  const viewDirection = new THREE.Vector3(1, 0.65, 1).normalize();
  const targetCameraPosition = center.clone().addScaledVector(viewDirection, viewDistance);

  // Loosen the zoom limits to fit this component: close enough to approach
  // a small window, far enough to back away from a whole wall if needed.
  controls.minDistance = Math.max(viewDistance * 0.3, 0.3);
  controls.maxDistance = viewDistance * 3;

  startCameraTransition(targetCameraPosition, center);
}

/* -------------------------------------------------------------
   Simple camera transition: instead of snapping instantly, we
   smoothly interpolate the camera position and OrbitControls
   target over a short duration. `updateCameraTransition()` is
   called once per frame from the render loop (Section 9).
------------------------------------------------------------- */
const CAMERA_TRANSITION_DURATION_MS = 700;
let activeCameraTransition = null;

function startCameraTransition(toPosition, toTarget) {
  activeCameraTransition = {
    fromPosition: camera.position.clone(),
    toPosition: toPosition.clone(),
    fromTarget: controls.target.clone(),
    toTarget: toTarget.clone(),
    startTime: performance.now(),
  };
}

// Ease-in-out curve so the camera eases into motion and settles smoothly,
// instead of moving at a constant, mechanical speed.
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function updateCameraTransition() {
  if (!activeCameraTransition) return;

  const elapsed = performance.now() - activeCameraTransition.startTime;
  const progress = Math.min(elapsed / CAMERA_TRANSITION_DURATION_MS, 1);
  const eased = easeInOutQuad(progress);

  camera.position.lerpVectors(
    activeCameraTransition.fromPosition,
    activeCameraTransition.toPosition,
    eased
  );
  controls.target.lerpVectors(
    activeCameraTransition.fromTarget,
    activeCameraTransition.toTarget,
    eased
  );

  if (progress >= 1) {
    activeCameraTransition = null;
  }
}

// Wire up the two buttons.
inspectButton.addEventListener("click", () => {
  if (selectedMesh) enterInspectionMode(selectedMesh);
});
returnButton.addEventListener("click", exitInspectionMode);

/* =============================================================
   START THE RENDER LOOP
   -------------------------------------------------------------
   This is intentionally the LAST line of executable code in the
   file. animate() (defined in Section 9) calls updateCameraTransition()
   (Section 13) every frame, so every section above must have finished
   running — and every const/let it touches must already exist — before
   the first frame is drawn.
============================================================= */
animate();

/* -------------------------------------------------------------
   STAGE 5 PREVIEW (not implemented yet):
   general UI polish — e.g. a small always-visible legend, subtle
   entrance/exit animation on the panel and measurement lines,
   and touch-friendly tweaks for tablets/mobile.
------------------------------------------------------------- */