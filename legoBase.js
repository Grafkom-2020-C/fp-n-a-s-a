
/*global THREE, document, dat, window*/

var camera, scene, renderer;
var cameraControls, effectController;
var projector;
var clock = new THREE.Clock();

var clickPlaceBrickControls;

var viewSize;
var aspectRatio;

var planeSize = 100; //mm
var groundPlaneSize = 20;
var groundPlane;
var backgroundColor;

var canvasWidth = window.innerWidth;
var canvasHeight = window.innerHeight;

var bricks = [];
var tempBricks = [];
var selectedBricks = [];
var brickMap;
var brickIdCount = 1;

function init() {
	backgroundColor = 0x808080;

	// RENDERER
	renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.gammaInput = true;
	renderer.gammaOutput = true;
	renderer.setSize(canvasWidth, canvasHeight);
	renderer.setClearColor(backgroundColor,1.0);

	var container = document.getElementById('container');
	container.appendChild( renderer.domElement );

	// CAMERA
	viewSize = 900;
	// aspect ratio of width of window divided by height of window
	aspectRatio = window.innerWidth/window.innerHeight;
	// OrthographicCamera( left, right, top, bottom, near, far )
	camera = new THREE.OrthographicCamera(
		-aspectRatio*viewSize / 2, aspectRatio*viewSize / 2,
		viewSize / 2, -viewSize / 2,
		-10000, 10000 );

	camera.position.set(40,-10,30);
	camera.up.set(0,0,1);
	// CONTROLS
	cameraControls = new THREE.OrbitControls(camera,renderer.domElement);
	cameraControls.target.set(80,80,0);

	//custom event listener
	//TODO- break into separate .js files
	renderer.domElement.addEventListener('mousedown',mouseDownPlaceBrick);
	renderer.domElement.addEventListener('mousemove',mouseMovePlaceBrick);

	renderer.domElement.addEventListener('mousedown',mouseDownSelectBrick);

	renderer.domElement.addEventListener('mousedown',mouseDownSetGroundPlaneHeight);

	window.addEventListener('resize',windowResizeListener,false);

	projector = new THREE.Projector();

	fillScene();
	initBrickMap();
}

function fillScene() {
	scene = new THREE.Scene();

	// LIGHTS
	scene.add( new THREE.AmbientLight( 0x222222 ) );

	var light = new THREE.DirectionalLight( 0xFFFFFF, 1.0 );
	light.position.set( 200, 400, 500 );

	scene.add( light );

	light = new THREE.DirectionalLight( 0xFFFFFF, 1.0 );
	light.position.set( -400, 200, -300 );

	scene.add( light );

	///////////////////////
	// GROUND
	//
	var groundPlaneGeometry = new THREE.LegoBrick({unitsLength:groundPlaneSize,unitsWidth:groundPlaneSize,isThinPiece:true });

	groundPlane = new THREE.Mesh(groundPlaneGeometry,
								new THREE.MeshPhongMaterial({color: 0xFF0000, transparent:true, opacity:1.0 }));
	groundPlane.position.z -= 3.2; //place top surface of brick at z=0
	scene.add(groundPlane);
	bricks.push(groundPlane);

	Coordinates.drawAllAxes({axisLength:100,axisRadius:1,axisTess:50});
}

function initBrickMap() {
	brickMap = new Array(groundPlaneSize);
	for(var x=0; x<groundPlaneSize; x++) {
		brickMap[x] = new Array(groundPlaneSize);
		for(var y=0; y<groundPlaneSize; y++) {
			brickMap[x][y] = new Array(1);
			brickMap[x][y][0] = 0;
		}
	}
}

function printBrickMap() {
	for(var x=0; x<brickMap.length; x++) {
		for(var y=0; y<brickMap[x].length; y++) {
			if(brickMap[x][y].length > 1 || brickMap[x][y][0] > 0) {
				console.log("( " + x + ", " + y + " )" + brickMap[x][y]);
			}
		}
	}
}

function deleteFromBrickMap(num) {
	for(var x=0; x<brickMap.length; x++) {
		for(var y=0; y<brickMap[x].length; y++) {
			for(var z=0; z<brickMap[x][y].length; z++) {
				if(brickMap[x][y][z] == num) {
					brickMap[x][y][z] = 0;
				}
			}
		}
	}
}

function deleteFromBrickMapAt(xLoc, yLoc, zLoc) {


	var num = brickMap[xLoc][yLoc][zLoc];
	if(num > 0) {
		deleteFromBrickMap(num);
	}else {
		//throw error
		console.log('no brick at location: ' + xLoc, + ', ' + yLoc + ', ' + zLoc);
	}
}


function addBrickToScene(locX, locY, isTemp, isTransparent) {
	var bx = Math.floor(effectController.brickSizeX);
	var by = Math.floor(effectController.brickSizeY);
	
	var intersection = findIntersectingBrick(locX,locY);
	//if no intersection found
	if(!intersection)
		return;

	//cant add to the top of a smooth piece
	if(intersection.object.geometry.isSmoothPiece) 
		return;
	
	var pos = calculateClosestBrickPosition(intersection.object,intersection.point);
	if(!pos)
		return;

	var brickVals = {unitsLength:bx,
					 unitsWidth:by,
					 isThinPiece:effectController.brickThin,
					 isSmoothPiece:effectController.brickSmooth,
					 brickColor:effectController.brickColor,
					 brickRotation:effectController.brickRotation,
					};
	
	//if the brick doesn't fit cleanly
	if(!isValidBrickPosition(pos,brickVals)) 
		return;

	var brickGeometry = new THREE.LegoBrick(brickVals);

	var brickMaterial;
	if(isTransparent) {
		brickMaterial = new THREE.MeshPhongMaterial({color: effectController.brickColor, transparent:true, opacity:.5})
	} else {
		brickMaterial = new THREE.MeshPhongMaterial({color: effectController.brickColor, transparent:false })
	}

	var leg = new THREE.Mesh(brickGeometry, brickMaterial);
	
	//set 0 position (to handle exploded view)
	leg.position = pos;

	//account for rotation
	var mat = calculateBrickMatrix(pos);

	leg.matrixAutoUpdate = false;
	leg.matrix.copy(mat);
	leg.matrixWorldNeedsUpdate = true;

	scene.add(leg);

	if(isTemp) {
		tempBricks.push(leg);
	}else {
		bricks.push(leg);
		updateBrickMap(pos,brickVals);
	}
}

function removeBrickFromScene(brick) {
	scene.remove(brick);

	var pos = brick.position;
	var x = Math.round(pos.x/8);
	var y = Math.round(pos.y/8);
	var z = Math.round(pos.z/3.2);
	deleteFromBrickMapAt(x,y,z);

	//remove from bricks[]
	for(var i=0; i<bricks.length; i++) {
		if(bricks[i] == brick) {
			bricks.splice(i,1);
		}
	}
}


function isValidBrickPosition(pos,brickVals) {
	var xStart, yStart, xDist, yDist;

	var zStart = Math.round(pos.z/3.2);
	var zDist = brickVals.isThinPiece ? 1 : 3;
	switch(brickVals.brickRotation) {
		case 0:
			xStart = pos.x/8;
			yStart = pos.y/8;
			xDist = brickVals.unitsLength;
			yDist = brickVals.unitsWidth;
			break;
		case 90:
			xStart = pos.x/8 - brickVals.unitsWidth + 1;
			yStart = pos.y/8;
			xDist = brickVals.unitsWidth;
			yDist = brickVals.unitsLength;
			break;
		case 180:
			xStart = pos.x/8 - brickVals.unitsLength + 1;
			yStart = pos.y/8 - brickVals.unitsWidth + 1;
			xDist = brickVals.unitsLength;
			yDist = brickVals.unitsWidth;
			break;
		case 270:
			xStart = pos.x/8;
			yStart = pos.y/8 - brickVals.unitsLength + 1;
			xDist = brickVals.unitsWidth;
			yDist = brickVals.unitsLength;
			break;
		default: 
			throw new Error('Could not determine brick rotation');
	}

	for(var x=0; x<xDist; x++) {
		for(var y=0; y<yDist; y++) {
			for(var z=0; z<zDist; z++) {
				if(brickMap[xStart+x][yStart+y][zStart+z] > 0) {
					return false;
				}
			}
		}
	}
	return true;
}

// 

function printCameraData() {
	console.log("position(x,y,z)" + "(" + camera.position.x + "," + camera.position.y + "," + camera.position.z + ")");
	console.log("targed: " + camera.target);
	console.log("center: " + camera.center);
}

//list bricks
function listParts() {
	console.log('num bricks: ' + bricks.length);
	console.log('bricks:');
	
	var partList = [];
	//start collecting at x=1 to skip groundplane
	for(var x=1; x<bricks.length; x++) {
		var b = bricks[x].geometry;

		var len1, len2, isSmooth, isThin;
		if(b.unitsLength>b.unitsWidth) {
			len1 = b.unitsLength;
			len2 = b.unitsWidth;
		}else {
			len1 = b.unitsWidth;
			len2 = b.unitsLength;
		}

		isSmooth = b.isSmoothPiece;
		isThin = b.isThinPiece;

		var dims = {length:len1,width:len2,smooth:isSmooth,thin:isThin};
		if(!partList[dims]) {
			partList[dims] = 0;
		}
		partList[dims]++;

	}

	return partList;
}

/**
 * return position of lego brick intersected
 * @param  {[type]} mx - mouseX from event 
 * @param  {[type]} my - mouseY from event
 * @return {[type]}    [description]
 */
function findIntersectingBrick(mx,my) {
	//finding object intersection
	var canvasPosition = renderer.domElement.getBoundingClientRect();
	var mouseX = mx - canvasPosition.left;
	var mouseY = my - canvasPosition.top;
	var mouseVector = new THREE.Vector3(2 * ( mouseX / canvasWidth ) - 1,
										1 - 2 * ( mouseY / canvasHeight ));

	var raycaster = projector.pickingRay( mouseVector.clone(), camera );


	var intersects = raycaster.intersectObjects( bricks,true );


	if ( intersects.length > 0 ) {
	

		return intersects[0];
	}
	return undefined;
}

//should go in lego brick class
function calculateClosestBrickPosition(brick,vec) {
	//prevent adding a brick by clicking on the side of another
	var CLICK_THRESHOLD = .1;

	var e = brick.matrix.elements;
	var objPos = new THREE.Vector3(e[12],e[13],e[14]);
	var clickPos = vec;

	var legoUnitSize = 8;
	var xClickPos = clickPos.x/legoUnitSize;
	var yClickPos = clickPos.y/legoUnitSize;
	//finding brick offset
	var xBlockNum = Math.floor(xClickPos);
	var yBlockNum = Math.floor(yClickPos);

	//prevent clicking on side of previous brick
	// TODO: find a more efficient way of doing this
	if(Math.abs(xClickPos-xBlockNum) < CLICK_THRESHOLD ||
	   Math.abs(yClickPos-yBlockNum) < CLICK_THRESHOLD) {
		return undefined;
	}
	if(Math.abs(xClickPos-xBlockNum) > 1-CLICK_THRESHOLD ||
	   Math.abs(yClickPos-yBlockNum) > 1-CLICK_THRESHOLD) {
		return undefined;
	}

	//calculating 3d position based off of brick offset
	var pos = new THREE.Vector3(xBlockNum*legoUnitSize,yBlockNum*legoUnitSize,0);
	//setting z component above selected brick
	pos.z += (brick.geometry.depth + objPos.z);
	
	return pos;
}

function calculateBrickMatrix(brickPosition) {
		
		//RIGHT MULT - forward
		// TODO - make more efficient??
		//		mat.multiply(new THREE.Matrix().make...).multiply(new THREE...)...
		var mat = new THREE.Matrix4();
		mat = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeTranslation(-4,-4,0),mat);
		mat = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeRotationZ(effectController.brickRotation*Math.PI/180),mat);
		mat = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeTranslation(4,4,0),mat);
		mat = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeTranslation(brickPosition.x,brickPosition.y,brickPosition.z),mat);

		//for exploded view
		var transVec = new THREE.Vector3(
				(brickPosition.x/8)*(effectController.explodeXDist),
				(brickPosition.y/8)*(effectController.explodeYDist),
				(brickPosition.z/3.2)*(effectController.explodeZDist)
			);

		mat = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeTranslation(transVec.x,transVec.y,transVec.z),mat);

		return mat;
}

//used by exploded view
function updateAllBrickPositions() {
	for(var x=1; x<bricks.length; x++) {
		var brick = bricks[x];
		
		//calculate 0 exploded position based on segment positions

		//take the 0 position from Mesh object
		var pos = brick.position;

		var newMat = calculateBrickMatrix(pos);

		brick.matrixAutoUpdate = false;
		brick.matrix.copy(newMat);
		brick.matrixWorldNeedsUpdate = true;
	}
}

function isExplodedCheck() {
	return effectController.explodeXDist > 0 ||
			effectController.explodeYDist > 0 ||
			effectController.explodeZDist > 0;						
}

function mouseDownPlaceBrick(event) {
	if(isExplodedCheck()) {
		return;
	}

	if(effectController.mouseState == "Tambah Lego") {
		event.preventDefault(); //doesnt prevent call to OrbitControls???
		
		addBrickToScene(event.clientX, event.clientY, false, false);
	}
}

function mouseMovePlaceBrick( event ) {
	while(tempBricks.length > 0) {
		var b = tempBricks.pop();
		scene.remove(b);
	}

	if(isExplodedCheck()) {
		return;
	}

    if(effectController.mouseState == "Tambah Lego") {
		event.preventDefault(); //doesnt prevent call to OrbitControls???
		
		addBrickToScene(event.clientX, event.clientY, true, true);
	}
}

//change how bricks look when selected
function mouseDownSelectBrick(event) {

	if(effectController.mouseState == "Pilih Lego") {
		event.preventDefault(); //doesnt prevent call to OrbitControls???

		//remove previously selected blocks if CTRL key not held
		if(!event.ctrlKey) {
			while(selectedBricks.length > 0) {
				var b = selectedBricks.pop();
				b.material.opacity = .5;
			}
		}

		var intersection = findIntersectingBrick(event.clientX,event.clientY);
		//if no intersection found
		if(!intersection)
			return;
		
		var brick = intersection.object;
		if(brick==groundPlane)
			return; 
		
		brick.material.opacity = 1;

		selectedBricks.push(brick);
	}
}

function mouseDownSetGroundPlaneHeight(event) {
	if(effectController.mouseState == "Set Ground Plane Height") {
		var intersection = findIntersectingBrick(event.clientX,event.clientY);
		//if no intersection found
		if(!intersection)
			return;
		
		var pos = calculateClosestBrickPosition(intersection.object,intersection.point);

		var brick = intersection.object;
		if(brick==groundPlane) {
			return;
		}
		var newHeight = brick.matrix.elements[14];

		//update effectController and set groundPlane object's height
		effectController.groundPlaneHeight = Math.round((newHeight+3.2)/3.2) - 1;
		groundPlane.position.z = newHeight-3.2;
	}
}

function windowResizeListener(event) {
	console.log(event);
	renderer.setSize(window.innerWidth,window.innerHeight);
}

//just creates json string for now
function exportToJson() {
	var VERSION = '0.0.2';
	
	var jsonObj = {};
	jsonObj['version'] = VERSION;
	jsonObj['bricks'] = { numBricks:bricks.length-1 };

	//skip brick[0] -> the ground plane
	for(var i=1; i<bricks.length; i++) {
		var brick = bricks[i];
		var geom = brick.geometry;

		var brickName = "brick"+i;
		jsonObj['bricks'][brickName] = {
				"unitsLength": geom.unitsLength,
				"unitsWidth": geom.unitsWidth,
				"thin": geom.isThinPiece,
				"smooth":geom.isSmoothPiece,
				"rotation": geom.brickRotation,
				"color": brick.material.color,

				//in px coordinates. should this be in lego units??? (heights diff between thin/thick bricks)
				"position": new THREE.Vector3().setFromMatrixPosition(brick.matrix),
				"matrix": brick.matrix,
		};
	}

	return jsonObj;
}

//add specified bricks to scene from json
function importJson(jsonStr) {
	var VERSION = '0.0.2';
	var json;
	try {
		json = JSON.parse(jsonStr);
	}catch(e) {
		alert('Could not load JSON data. \nException:\n\t' + e);
		return;
	}

	if(json['version'] != VERSION) {
		console.log('JSON brick data incompatible. Expected version ' + 
			VERSION + ' but found version: ' + json['version']);
		return;
	}

	var jsonBricks = json['bricks'];
	var len = jsonBricks['numBricks'];
	for(var i=0; i<len; i++) {

		//TODO: find a better way of iterating over values
		var brickName = 'brick'+(i+1);
		// var brick = jsonBricks[brickName];
		var brick = jsonBricks[brickName];

		//TODO potentially use json 'brick' values directly
		var brickVals = {unitsLength:brick['unitsLength'],
						 unitsWidth:brick['unitsWidth'],
						 isThinPiece:brick['thin'],
						 isSmoothPiece:brick['smooth'],
						 // brickColor:brick['color'],
						 // brickRotation:brick['rotation'],
						};
		var colorObj = brick['color'];
		var brickColor = new THREE.Color(colorObj.r,colorObj.g,colorObj.b);

		var brickGeometry = new THREE.LegoBrick(brickVals);
		var leg = new THREE.Mesh(brickGeometry,
						new THREE.MeshPhongMaterial({color: brickColor, transparent:false }));

		//TODO find a better way of generating matrix
		var mat = new THREE.Matrix4();
		for(var x=0; x<16; x++) {
			mat.elements[x] = brick['matrix']['elements'][x];
		}
// 		mat.elements = brick['matrix'].elements;
		leg.matrixAutoUpdate = false;
		leg.matrix.copy(mat);
		leg.matrixWorldNeedsUpdate = true;

		scene.add(leg);
	
		bricks.push(leg);
	}

	return;

}

function clearBricks() {
	for(var i=0; i<bricks.length; i++) {
		var b = bricks[i];
		scene.remove(b);
	}

	bricks = [];
	scene.add(groundPlane);
	bricks.push(groundPlane);

	//clear then reinit brickMap
	brickMap = [];
	initBrickMap();

	selectedBricks = [];
}

function setAllBrickOpacity(val) {
	//skip ground plane
	for(var x=1; x<bricks.length; x++) {
		var b = bricks[x];

		b.material.transparent = val<1 ? true : false;
		b.material.opacity = val;
	}
}

function animate() {
	window.requestAnimationFrame(animate);
	render();
}

function render() {
	var delta = clock.getDelta();
	cameraControls.update(delta);

	//calculate view size based on camera distance from target
	var diff = new THREE.Vector3().subVectors(camera.position,cameraControls.target);
	var dist = Math.sqrt(diff.x*diff.x + diff.y*diff.y + diff.z*diff.z);
	viewSize = dist;

	camera.left = -aspectRatio*viewSize / 2;
	camera.right = aspectRatio*viewSize / 2;
	camera.top = viewSize / 2;
	camera.bottom = -viewSize / 2;
	camera.updateProjectionMatrix();

	renderer.render(scene, camera);
}

function moveSelectedBrick(xDelta, yDelta, zDelta) {

	var disp = new THREE.Vector3(xDelta*8,yDelta*8,zDelta*3.2);
	for(var i=0; i<selectedBricks.length; i++) {
		var b = selectedBricks[i];
		var currentMatrix = b.matrix;

		var newMat = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().setPosition(disp), currentMatrix);

		b.matrixAutoUpdate = false;
		b.matrix.copy(newMat);
		b.matrixWorldNeedsUpdate = true;

		//update position
		var newPos = new THREE.Vector3();
		newPos.addVectors(b.position,disp);
		b.position = newPos;

	}
}

//TODO - reset effect controller back to what it used to be
//TOOD - make sure current value for effect controller doesn't affect rotation
function rotateSelectedBrick(deg) {

	for(var x=0; x<selectedBricks.length; x++) {
		var b = selectedBricks[x];
		var currentMatrix = b.matrix;

		effectController.brickRotation += deg;
		effectController.brickRotation %= 360;

		var newMat = calculateBrickMatrix(b.position);
		b.matrixAutoUpdate = false;
		b.matrix.copy(newMat);
		b.matrixWorldNeedsUpdate = true;
	}
}

function setupGui() {
	effectController = {
		mouseState:"Tambah Lego",

		mouseSelectMoveCamera: function() {
			//TODO - call mouseControlHandle instead of replicating functionality
			effectController.mouseState = 'Atur Kamera';
			cameraControls.enabled = true;
			setAllBrickOpacity(1);
		},
		cameraType:'Orthographic',
		
		groundPlaneHeight:0,
		groundPlaneVisible:true,
		groundPlaneOpacity:1.0,
		groundPlaneWireframe:false,
		groundPlaneColor:0xFF0000,

		wireframeAllBricks:false,
		backgroundColor:0x808080,

		brickSizeX:1,
		brickSizeY:1,

		mousePlaceBrickButton: function() {
			effectController.mouseState = 'Tambah Lego';
			cameraControls.enabled = false;
			setAllBrickOpacity(1);
		},
		brickThin:false,
		brickSmooth:false,
		brickColor:0x0000FF,
		brickRotation:0,


		mouseSelectBrickButton: function() {
			//TODO - call mouseControlHandle instead of replicating functionality
			effectController.mouseState = 'Pilih Lego';
			cameraControls.enabled = false;
			setAllBrickOpacity(.5);
		},
		deleteSelectedBrick: function() {
			for(var x=0; x<selectedBricks.length; x++) {
				var b = selectedBricks[x];
				removeBrickFromScene(b);
			}
		},
	
	
		clearScene:function() {
			clearBricks();
		},
	};

	//default state for mouse control
	cameraControls.enabled = false;

	var gui = new dat.GUI();
	f = gui.addFolder("Mode Mouse");
	var mouseControlHandle = f.add(effectController,"mouseState",
				["Tambah Lego","Pilih Lego","Atur Kamera"]).name("Mouse State").listen();

	var cameraTypeHandle = f.add(effectController,'cameraType',['Orthographic']).name('Tipe Kamera');

	f = gui.addFolder("Warna");
	
	var gpc = f.addColor(effectController,"groundPlaneColor").name("Warna Papan");
	var editColorHandle = f.addColor(effectController,"brickColor").name("Warna Lego");
	var backgroundColorHandle = f.addColor(effectController,"backgroundColor").name("Warna Bg");
	f = gui.addFolder("Pengaturan Lego");
	f.add(effectController,'mousePlaceBrickButton').name('Tambah Lego');
	var lengthHandle = f.add(effectController,"brickSizeX",1,10).step(1).name("Panjang");
	var widthHandle = f.add(effectController,"brickSizeY",1,10).step(1).name("Lebar");
	
	f.add(effectController,"brickThin").name("Lego tipis");
	f.add(effectController,"brickSmooth").name("Lego datar");
	

	f = gui.addFolder("Edit Lego");
	f.add(effectController,'mouseSelectBrickButton').name('Pilih Lego');
	f.add(effectController,"deleteSelectedBrick").name("Hapus Lego");

	f = gui.addFolder("Clear Scene");
	f.add(effectController,"clearScene").name("Clear");

	mouseControlHandle.onChange(function(value) {
		
		if(value=="Tambah Lego") {
			cameraControls.enabled = false;
			setAllBrickOpacity(1);

		}else if(value=="Pilih Lego") {
			cameraControls.enabled = false;
			setAllBrickOpacity(.5);

		}else if(value=="Atur Kamera") {
			cameraControls.enabled = true;
			setAllBrickOpacity(1);

		}
	});

	cameraTypeHandle.onChange(function(value) {
		var position = camera.position;
		var up = camera.up;
		var target = cameraControls.target;

		if(value == 'Orthographic') {
			camera = new THREE.OrthographicCamera(
				-aspectRatio*viewSize / 2, aspectRatio*viewSize / 2,
				viewSize / 2, -viewSize / 2,
				-10000, 10000 );
		}else if(value == 'Perspective') {
			camera = new THREE.PerspectiveCamera(
				45, aspectRatio, -10000, 10000);
		}

		camera.position.copy(position);
		camera.up.copy(up);
		cameraControls = new THREE.OrbitControls(camera,renderer.domElement);
		cameraControls.target.copy(target);

	});

	gpc.onChange(function(value) { //color
		groundPlane.material.color = new THREE.Color(value);
	});

	backgroundColorHandle.onChange(function(value) {
		renderer.setClearColor(value,1.0);
	});

	//length control
	lengthHandle.onChange(function(value) {
		effectController.brickSizeX = Math.floor(value);
	});

	widthHandle.onChange(function(value) {
		effectController.brickSizeY = Math.floor(value);
	});

;

	editColorHandle.onChange(function(value) {
		for(var x=0; x<selectedBricks.length; x++) {
			selectedBricks[x].material.color = new THREE.Color(value);
		}
	});

}
init();
setupGui();
animate();
