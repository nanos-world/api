'use strict';

const fs = require('fs');

const APIFiles = require('./APIFiles.json');

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
		return {};

	return JSON.parse(fs.readFileSync(file_path));
}

// Collections stored as arrays internally, but written keyed by entry name so Crowdin identifies strings by name instead of by array index
const KeyedCollections = ["constructors", "functions", "static_functions", "events", "operators", "properties", "static_properties"];

// Converts arrays of named entries into objects keyed by name, keeping the array order as the object key order
function KeyCollectionsByName(object) {
	for (const collection_key of KeyedCollections) {
		const list = object[collection_key];

		if (!Array.isArray(list) || list.length == 0)
			continue;

		// Anything without a usable name stays an array, as there is nothing stable to key it by
		if (!list.every((entry) => entry && typeof entry.name === "string" && entry.name.length > 0))
			continue;

		// Overloads share a name, so every entry of a duplicated name gets disambiguated the same way
		const name_counts = {};

		for (const entry of list)
			name_counts[entry.name] = (name_counts[entry.name] || 0) + 1;

		const keyed = {};

		for (const entry of list) {
			let key = name_counts[entry.name] > 1 && entry.authority ? `${entry.name}@${entry.authority}` : entry.name;

			// Last resort for entries that authority alone cannot tell apart
			for (let ordinal = 2; keyed[key] != null; ordinal++)
				key = `${entry.name}#${ordinal}`;

			keyed[key] = entry;
		}

		object[collection_key] = keyed;
	}

	return object;
}

// Saves JSON to disk stringified
function SaveJSON(path, object) {
	return fs.writeFileSync(__dirname + "/" + path, JSON.stringify(KeyCollectionsByName(object)));
}

// Copies a folder into the generated output, keying the collections of every JSON file on the way
function CopyAPIFolder(source, destination) {
	fs.mkdirSync(__dirname + "/" + destination, { recursive: true });

	for (const entry of fs.readdirSync(__dirname + "/" + source, { withFileTypes: true })) {
		if (entry.isDirectory())
			CopyAPIFolder(source + "/" + entry.name, destination + "/" + entry.name);
		else if (entry.name.endsWith(".json"))
			SaveJSON(destination + "/" + entry.name, LoadJSON(source + "/" + entry.name));
		else
			fs.copyFileSync(`${__dirname}/${source}/${entry.name}`, `${__dirname}/${destination}/${entry.name}`);
	}
}

function AddUsedEnum(type, table, version_key, class_key, class_type, name, is_base_class) {
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

	base_url = "/docs/" + (version_key == "BleedingEdge" ? "next/" : "");

	if (class_type == "Class")
	{
		base_url += "scripting-reference/classes";

		if (is_base_class)
			base_url += "/base-classes";
	}
	else if (class_type == "StaticClass")
		base_url += "scripting-reference/static-classes";

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
		url = `${base_url}/${class_key.toLowerCase()}#constructor-${name.toLowerCase().replaceAll(' ', '-')}`;
		label = `${class_key} ${name}`;
	}

	_enum.relations.etc.push({ url, label });
}

function CheckUsedEnum(func, name, table, version_key, class_key, class_type, is_base_class) {
	if (func.parameters) {
		for (const parameterKey in func.parameters) {
			const parameter = func.parameters[parameterKey];
			AddUsedEnum(parameter.type, table, version_key, class_key, class_type, name, is_base_class);
		}
	}

	if (func.arguments) {
		for (const argumentKey in func.arguments) {
			const argument = func.arguments[argumentKey];
			AddUsedEnum(argument.type, table, version_key, class_key, class_type, name, is_base_class);
		}
	}

	if (func.return) {
		for (const returnKey in func.return) {
			const ret = func.return[returnKey];
			AddUsedEnum(ret.type, table, version_key, class_key, class_type, name, is_base_class);
		}
	}
}

// Finds relations automatically
function FindsGetSetRelationsAutomatically(functions, table, version_key, class_key, class_type, is_base_class) {
	// TODO: This algorithm is O(n²) BOOM
	// Which doesn't matter as the page build is static, I guess
	for (const functionKey in functions) {
		let _function = functions[functionKey];

		const isIs = _function.name.startsWith("Is");
		const isGetter = _function.name.startsWith("Get");
		const isSetter = _function.name.startsWith("Set");

		// Check used Enums
		CheckUsedEnum(_function, _function.name, table, version_key, class_key, class_type, is_base_class);

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
		FindsGetSetRelationsAutomatically(class_data.functions, "functions", version_key, class_key, class_type, class_data.is_base);
	}

	if (class_data.static_functions) {
		class_data.static_functions.sort((a, b) => a.name.localeCompare(b.name));
		FindsGetSetRelationsAutomatically(class_data.static_functions, "static_functions", version_key, class_key, class_type, class_data.is_base);
	}

	// Check for constructors
	if (class_data.constructors) {
		for (const constructorKey in class_data.constructors)
			CheckUsedEnum(class_data.constructors[constructorKey], class_data.constructors[constructorKey].name, "constructors", version_key, class_key, class_type, class_data.is_base);
	}

	// Check for events
	if (class_data.events) {
		for (const eventKey in class_data.events)
			CheckUsedEnum(class_data.events[eventKey], class_data.events[eventKey].name, "events", version_key, class_key, class_type, class_data.is_base);
	}

	if (class_data.events)
		class_data.events.sort((a, b) => a.name.localeCompare(b.name));

	// Gets Inherited for Base Class
	if (class_data.is_base) {
		class_data.inheritance_children = [];

		for (const class_key in APIFiles.Classes) {
			if (!ClassesData[version_key][class_key].is_base && ClassesData[version_key][class_key].inheritance && ClassesData[version_key][class_key].inheritance.includes(class_data.name)) {
				class_data.inheritance_children.push(class_key)
			}
		}
	}
}

function Run() {
	// Create generated folders
	fs.mkdirSync(__dirname + "/.generated/en/Classes/", { recursive: true });
	fs.mkdirSync(__dirname + "/.generated/en/Stable/Classes/", { recursive: true });

	fs.mkdirSync(__dirname + "/.generated/en/StaticClasses/", { recursive: true });
	fs.mkdirSync(__dirname + "/.generated/en/Stable/StaticClasses/", { recursive: true });

	// Loads all Classes
	for (const class_key in APIFiles.Classes) {
		console.log("Loading Class '%s'...", class_key);

		ClassesData.Stable[class_key] = LoadJSON("Stable/Classes/" + APIFiles.Classes[class_key]);
		ClassesData.BleedingEdge[class_key] = LoadJSON("Classes/" + APIFiles.Classes[class_key]);
	}

	// Loads all Static Classes
	for (const class_key in APIFiles.StaticClasses) {
		console.log("Loading StaticClass '%s'...", class_key);

		StaticClassesData.Stable[class_key] = LoadJSON("Stable/StaticClasses/" + APIFiles.StaticClasses[class_key]);
		StaticClassesData.BleedingEdge[class_key] = LoadJSON("StaticClasses/" + APIFiles.StaticClasses[class_key]);
	}

	// Process Classes
	for (const class_key in APIFiles.Classes) {
		let data_stable = ClassesData.Stable[class_key];
		if (data_stable)
			ProcessClass(data_stable, "Stable", class_key, "Class");

		let data_bleeding_edge = ClassesData.BleedingEdge[class_key];
		if (data_bleeding_edge)
			ProcessClass(data_bleeding_edge, "BleedingEdge", class_key, "Class");
	}

	// Process Static Classes
	for (const class_key in APIFiles.StaticClasses) {
		let data_stable = StaticClassesData.Stable[class_key];
		if (data_stable)
			ProcessClass(data_stable, "Stable", class_key, "StaticClass");

		let data_bleeding_edge = StaticClassesData.BleedingEdge[class_key];
		if (data_bleeding_edge)
			ProcessClass(data_bleeding_edge, "BleedingEdge", class_key, "StaticClass");
	}

	// Save Classes
	for (const class_key in APIFiles.Classes) {
		let data_stable = ClassesData.Stable[class_key];
		if (data_stable)
			SaveJSON(".generated/en/Stable/Classes/" + APIFiles.Classes[class_key], data_stable);

		let data_bleeding_edge = ClassesData.BleedingEdge[class_key];
		if (data_bleeding_edge)
			SaveJSON(".generated/en/Classes/" + APIFiles.Classes[class_key], data_bleeding_edge);
	}

	// Save Static Classes
	for (const class_key in APIFiles.StaticClasses) {
		let data_stable = StaticClassesData.Stable[class_key];
		if (data_stable)
			SaveJSON(".generated/en/Stable/StaticClasses/" + APIFiles.StaticClasses[class_key], data_stable);

		let data_bleeding_edge = StaticClassesData.BleedingEdge[class_key];
		if (data_bleeding_edge)
			SaveJSON(".generated/en/StaticClasses/" + APIFiles.StaticClasses[class_key], data_bleeding_edge);
	}

	// Saves updated Enums
	SaveJSON(".generated/en/Enums.json", EnumsData.BleedingEdge);
	SaveJSON(".generated/en/Stable/Enums.json", EnumsData.Stable);

	// Copies all other files
	CopyAPIFolder("StandardLibraries", ".generated/en/StandardLibraries");
	CopyAPIFolder("Stable/StandardLibraries", ".generated/en/Stable/StandardLibraries");

	CopyAPIFolder("UtilityClasses", ".generated/en/UtilityClasses");
	CopyAPIFolder("Stable/UtilityClasses", ".generated/en/Stable/UtilityClasses");

	CopyAPIFolder("Structs", ".generated/en/Structs");
	CopyAPIFolder("Stable/Structs", ".generated/en/Stable/Structs");
}

Run();