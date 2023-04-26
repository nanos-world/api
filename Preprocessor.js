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
		Vehicle: "Vehicle.json",
		Weapon: "Weapon.json",
		WebUI: "WebUI.json",
		Widget: "Widget.json",
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

var EnumsData = LoadJSON("Enums.json");

// Loads JSON from disk and returns its object
function LoadJSON(path) {
	return JSON.parse(fs.readFileSync(__dirname + "/" + path));
}

// Saves JSON to disk stringified
function SaveJSON(path, object) {
	return fs.writeFileSync(__dirname + "/" + path, JSON.stringify(object));
}

function AddUsedEnum(type, table, class_key, class_type, name) {
	let _enum = EnumsData[type];

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

	if (table == "functions")
	{
		url = `${base_url}/${class_key.toLowerCase()}#function-${name.toLowerCase()}`;
		label = `${class_key}.${name}`;
	}
	else if (table == "static_functions")
	{
		url = `${base_url}/${class_key.toLowerCase()}#static-function-${name.toLowerCase()}`;
		label = `${class_key}.${name}`;
	}
	else if (table == "events")
	{
		url = `${base_url}/${class_key.toLowerCase()}#event-${name.toLowerCase()}`;
		label = `${class_key} ${name} Event`;
	}
	else if (table == "constructors")
	{
		url = `${base_url}/${class_key.toLowerCase()}#constructor-${name.toLowerCase()}`;
		label = `${class_key} ${name}`;
	}

	_enum.relations.etc.push({ url, label });
}

function CheckUsedEnum(func, name, table, class_key, class_type) {
	if (func.parameters)
	{
		for (const parameterKey in func.parameters) {
			const parameter = func.parameters[parameterKey];
			AddUsedEnum(parameter.type, table, class_key, class_type, name);
		}
	}

	if (func.arguments)
	{
		for (const argumentKey in func.arguments) {
			const argument = func.arguments[argumentKey];
			AddUsedEnum(argument.type, table, class_key, class_type, name);
		}
	}

	if (func.return)
	{
		for (const returnKey in func.return) {
			const ret = func.return[returnKey];
			AddUsedEnum(ret.type, table, class_key, class_type, name);
		}
	}
}

// Finds relations automatically
function FindsGetSetRelationsAutomatically(functions, table, version_key, class_key, class_type) {
	// TODO: This algorithm is O(n²) BOOM
	// Which doesn't matter as the page build is static, I guess
	for (const functionKey in functions) {
		let _function = functions[functionKey];

		const isGetter = _function.name.startsWith("Get")
		const isSetter = _function.name.startsWith("Set");

		// Only gets enum once
		if (version_key == "BleedingEdge")
			CheckUsedEnum(_function, _function.name, table, class_key, class_type);

		if (isSetter || isGetter) {
			const otherName = _function.name.replace(isGetter ? 'G' : 'S', isGetter ? 'S' : 'G');

			for (const functionKey2 in functions) {
				let _function2 = functions[functionKey2];

				if (_function2.name == otherName) {
					if (!_function.relations)
						_function.relations = {};

					if (!_function.relations[table])
						_function.relations[table] = [];

					if (!_function.relations[table].includes(otherName))
						_function.relations[table].push(otherName);
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
	if (version_key == "BleedingEdge")
	{
		// Check for constructors
		if (class_data.constructors)
		{
			for (const constructorKey in class_data.constructors)
				CheckUsedEnum(class_data.constructors[constructorKey], class_data.constructors[constructorKey].description, "constructors", class_key, class_type);
		}

		// Check for events
		if (class_data.events)
		{
			for (const eventKey in class_data.events)
				CheckUsedEnum(class_data.events[eventKey], class_data.events[eventKey].name, "events", class_key, class_type);
		}
	}

	if (class_data.events)
		class_data.events.sort((a, b) => a.name.localeCompare(b.name));
}

// Process a Class
function PreprocessClass(type, class_name, file, version) {
	console.log("Processing %s '%s' (%s)...", type, class_name, version);
	let data = LoadJSON(file);

	ProcessClass(data, version, class_name, type);

	SaveJSON(".generated/" + file, data);
}

function Run() {
	// Create generated folders
	fs.mkdirSync(__dirname + "/.generated/Classes/", { recursive: true });
	fs.mkdirSync(__dirname + "/.generated/Stable/Classes/", { recursive: true });

	fs.mkdirSync(__dirname + "/.generated/StaticClasses/", { recursive: true });
	fs.mkdirSync(__dirname + "/.generated/Stable/StaticClasses/", { recursive: true });

	// Process Classes
	for (const class_key in APIData.Class)
	{
		PreprocessClass("Class", class_key, "Classes/" + APIData.Class[class_key], "BleedingEdge")
		PreprocessClass("Class", class_key, "Stable/Classes/" + APIData.Class[class_key], "Stable")
	}

	// Process Static Classes
	for (const class_key in APIData.StaticClass)
	{
		PreprocessClass("StaticClass", class_key, "StaticClasses/" + APIData.StaticClass[class_key], "BleedingEdge")
		PreprocessClass("StaticClass", class_key, "Stable/StaticClasses/" + APIData.StaticClass[class_key], "Stable")
	}
}

Run();