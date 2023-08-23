'use strict';

const fs = require('fs');

// List of all API Classes
const APIData = {
	Class: {
		Entity: "BaseEntity.json",
		Actor: "BaseActor.json",
		Pickable: "BasePickable.json",
		Paintable: "BasePaintable.json",
		Damageable: "BaseDamageable.json",
		Billboard: "Billboard.json",
		Blueprint: "Blueprint.json",
		Cable: "Cable.json",
		Canvas: "Canvas.json",
		Character: "Character.json",
		CharacterSimple: "CharacterSimple.json",
		Database: "Database.json",
		Decal: "Decal.json",
		File: "File.json",
		Gizmo: "Gizmo.json",
		Grenade: "Grenade.json",
		Light: "Light.json",
		Melee: "Melee.json",
		Particle: "Particle.json",
		Player: "Player.json",
		Prop: "Prop.json",
		SceneCapture: "SceneCapture.json",
		StaticMesh: "StaticMesh.json",
		Sound: "Sound.json",
		TextRender: "TextRender.json",
		Trigger: "Trigger.json",
		VehicleWheeled: "VehicleWheeled.json",
		VehicleWater: "VehicleWater.json",
		Weapon: "Weapon.json",
		WebUI: "WebUI.json",
		Widget: "Widget.json",
		Widget3D: "Widget3D.json",
	},
	StaticClass: {
		Assets: "Assets.json",
		Chat: "Chat.json",
		Client: "Client.json",
		Console: "Console.json",
		Debug: "Debug.json",
		Discord: "Discord.json",
		Events: "Events.json",
		HTTP: "HTTP.json",
		Input: "Input.json",
		Level: "Level.json",
		Navigation: "Navigation.json",
		Package: "Package.json",
		PostProcess: "PostProcess.json",
		Server: "Server.json",
		Sky: "Sky.json",
		Steam: "Steam.json",
		Timer: "Timer.json",
		Trace: "Trace.json",
		Viewport: "Viewport.json",
	}
};

var EnumsData = {
	Stable: LoadJSON("Stable/Enums.json"),
	BleedingEdge: LoadJSON("Enums.json"),
};

var ClassesData = {
	Stable: {},
	BleedingEdge: {}
};

var StaticClassesData = {
	Stable: {},
	BleedingEdge: {}
};

// Loads JSON from disk and returns its object
function LoadJSON(path) {
	const file_path = __dirname + "/" + path;

	if (!fs.existsSync(file_path))
		return false;

	return JSON.parse(fs.readFileSync(file_path));
}

// Saves JSON to disk stringified
function SaveJSON(path, object) {
	return fs.writeFileSync(__dirname + "/" + path, JSON.stringify(object));
}

function AddUsedEnum(type, table, version_key, class_key, class_type, name) {
	let _enum = EnumsData[version_key][type];

	if (!_enum)
		return;

	if (!_enum.relations)
		_enum.relations = {};

	if (!_enum.relations.etc)
		_enum.relations.etc = [];

	let url;
	let base_url;
	let label;

	if (class_type == "Class")
		base_url = "/docs/next/scripting-reference/classes";
	else if (class_type == "StaticClass")
		base_url = "/docs/next/scripting-reference/static-classes";

	if (table == "functions") {
		url = `${base_url}/${class_key.toLowerCase()}#function-${name.toLowerCase()}`;
		label = `${class_key}.${name}`;
	}
	else if (table == "static_functions") {
		url = `${base_url}/${class_key.toLowerCase()}#static-function-${name.toLowerCase()}`;
		label = `${class_key}.${name}`;
	}
	else if (table == "events") {
		url = `${base_url}/${class_key.toLowerCase()}#event-${name.toLowerCase()}`;
		label = `${class_key} ${name} Event`;
	}
	else if (table == "constructors") {
		url = `${base_url}/${class_key.toLowerCase()}#constructor-${name.toLowerCase()}`;
		label = `${class_key} ${name}`;
	}

	_enum.relations.etc.push({ url, label });
}

function CheckUsedEnum(func, name, table, version_key, class_key, class_type) {
	if (func.parameters) {
		for (const parameterKey in func.parameters) {
			const parameter = func.parameters[parameterKey];
			AddUsedEnum(parameter.type, table, version_key, class_key, class_type, name);
		}
	}

	if (func.arguments) {
		for (const argumentKey in func.arguments) {
			const argument = func.arguments[argumentKey];
			AddUsedEnum(argument.type, table, version_key, class_key, class_type, name);
		}
	}

	if (func.return) {
		for (const returnKey in func.return) {
			const ret = func.return[returnKey];
			AddUsedEnum(ret.type, table, version_key, class_key, class_type, name);
		}
	}
}

// Finds relations automatically
function FindsGetSetRelationsAutomatically(functions, table, version_key, class_key, class_type) {
	// TODO: This algorithm is O(n²) BOOM
	// Which doesn't matter as the page build is static, I guess
	for (const functionKey in functions) {
		let _function = functions[functionKey];

		const isIs = _function.name.startsWith("Is");
		const isGetter = _function.name.startsWith("Get");
		const isSetter = _function.name.startsWith("Set");

		// Only gets enum once
		if (version_key == "BleedingEdge")
			CheckUsedEnum(_function, _function.name, table, version_key, class_key, class_type);

		if (isSetter || isGetter || isIs) {
			const pattern = isGetter ? "Get" : (isSetter ? "Set" : (isIs ? "Is" : ""));
			const otherNameGet = _function.name.replace(pattern, isGetter ? "Set" : "Get");
			const otherNameIs = _function.name.replace(pattern, isIs ? "Set" : "Is");

			for (const functionKey2 in functions) {
				let _function2 = functions[functionKey2];

				if (_function2.name == otherNameGet || _function2.name == otherNameIs) {
					if (!_function.relations)
						_function.relations = {};

					if (!_function.relations[table])
						_function.relations[table] = [];

					if (!_function.relations[table].includes(_function2.name))
						_function.relations[table].push(_function2.name);
				}
			}
		}
	}
}

// Sort and Process a Class
function ProcessClass(class_data, version_key, class_key, class_type) {
	if (class_data.functions) {
		class_data.functions.sort((a, b) => a.name.localeCompare(b.name));
		FindsGetSetRelationsAutomatically(class_data.functions, "functions", version_key, class_key, class_type);
	}

	if (class_data.static_functions) {
		class_data.static_functions.sort((a, b) => a.name.localeCompare(b.name));
		FindsGetSetRelationsAutomatically(class_data.static_functions, "static_functions", version_key, class_key, class_type);
	}

	// Only gets enum once
	if (version_key == "BleedingEdge") {
		// Check for constructors
		if (class_data.constructors) {
			for (const constructorKey in class_data.constructors)
				CheckUsedEnum(class_data.constructors[constructorKey], class_data.constructors[constructorKey].description, "constructors", version_key, class_key, class_type);
		}

		// Check for events
		if (class_data.events) {
			for (const eventKey in class_data.events)
				CheckUsedEnum(class_data.events[eventKey], class_data.events[eventKey].name, "events", version_key, class_key, class_type);
		}
	}

	if (class_data.events)
		class_data.events.sort((a, b) => a.name.localeCompare(b.name));

	// Gets Inherited for Base Class
	if (class_data.is_base) {
		class_data.inheritance_children = [];

		for (const class_key in APIData.Class) {
			if (ClassesData[version_key][class_key].inheritance && ClassesData[version_key][class_key].inheritance.includes(class_data.name)) {
				class_data.inheritance_children.push(class_key)
			}
		}
	}
}

function Run() {
	// Create generated folders
	fs.mkdirSync(__dirname + "/.generated/Classes/", { recursive: true });
	fs.mkdirSync(__dirname + "/.generated/Stable/Classes/", { recursive: true });

	fs.mkdirSync(__dirname + "/.generated/StaticClasses/", { recursive: true });
	fs.mkdirSync(__dirname + "/.generated/Stable/StaticClasses/", { recursive: true });

	// Loads all Classes
	for (const class_key in APIData.Class) {
		console.log("Loading Class '%s'...", class_key);

		ClassesData.Stable[class_key] = LoadJSON("Stable/Classes/" + APIData.Class[class_key]);
		ClassesData.BleedingEdge[class_key] = LoadJSON("Classes/" + APIData.Class[class_key]);
	}

	// Loads all Static Classes
	for (const class_key in APIData.StaticClass) {
		console.log("Loading StaticClass '%s'...", class_key);

		StaticClassesData.Stable[class_key] = LoadJSON("Stable/StaticClasses/" + APIData.StaticClass[class_key]);
		StaticClassesData.BleedingEdge[class_key] = LoadJSON("StaticClasses/" + APIData.StaticClass[class_key]);
	}

	// Process Classes
	for (const class_key in APIData.Class) {
		let data_stable = ClassesData.Stable[class_key];
		if (data_stable)
			ProcessClass(data_stable, "Stable", class_key, "Class");

		let data_bleeding_edge = ClassesData.BleedingEdge[class_key];
		if (data_bleeding_edge)
			ProcessClass(data_bleeding_edge, "BleedingEdge", class_key, "Class");
	}

	// Process Static Classes
	for (const class_key in APIData.StaticClass) {
		let data_stable = StaticClassesData.Stable[class_key];
		if (data_stable)
			ProcessClass(data_stable, "Stable", class_key, "StaticClass");

		let data_bleeding_edge = StaticClassesData.BleedingEdge[class_key];
		if (data_bleeding_edge)
			ProcessClass(data_bleeding_edge, "BleedingEdge", class_key, "StaticClass");
	}

	// Save Classes
	for (const class_key in APIData.Class) {
		let data_stable = ClassesData.Stable[class_key];
		if (data_stable)
			SaveJSON(".generated/Stable/Classes/" + APIData.Class[class_key], data_stable);

		let data_bleeding_edge = ClassesData.BleedingEdge[class_key];
		if (data_bleeding_edge)
			SaveJSON(".generated/Classes/" + APIData.Class[class_key], data_bleeding_edge);
	}

	// Save Static Classes
	for (const class_key in APIData.StaticClass) {
		let data_stable = StaticClassesData.Stable[class_key];
		if (data_stable)
			SaveJSON(".generated/Stable/StaticClasses/" + APIData.StaticClass[class_key], data_stable);

		let data_bleeding_edge = StaticClassesData.BleedingEdge[class_key];
		if (data_bleeding_edge)
			SaveJSON(".generated/StaticClasses/" + APIData.StaticClass[class_key], data_bleeding_edge);
	}

	// Saves updated Enums
	SaveJSON(".generated/Enums.json", EnumsData.BleedingEdge);
	SaveJSON(".generated/Stable/Enums.json", EnumsData.Stable);
}

Run();