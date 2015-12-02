
	var map;
	var contour_json;
	var station_marker;
	var interferingContoursNow;
	var interferingContours_layer;
	var interferingContoursHighlight_layer;
	var fmContoursNow;
	var fmContours_layer;
	var amStation_layer;
	var amProcessNow;
	var interferenceType;
	var uuid4InterferringContour;
	var channelClicked;
	
	var cursorX;
	var cursorY;
	var clickX = 330;
	var clickY = 400;

	var host = 'http://localhost:6479';
	//var host ="http://amr-web-node-dev01.elasticbeanstalk.com";
	var geo_host = "http://amr-geoserv-tc-dev01.elasticbeanstalk.com";
	var geo_space = "amr";

	var contour_style = {color: "#f00", opacity: 1.0,  fillOpacity: 0.3, fillColor: "#faa", weight: 2};
	var contour_style_highlight = {color: "#ff0", opacity: 1.0,  fillOpacity: 0.75, fillColor: "#aa5555", weight: 3};
	var contour_style_fm = {color: "#00f", opacity: 1.0,  fillOpacity: 0.5, fillColor: "#aaf", weight: 2};
	var contour_style_am_station = {color: "#f00", opacity: 1.0,  fillOpacity: 0.0, fillColor: "#aaf", weight: 2};
	
	function createMap() {
 
     L.mapbox.accessToken = 'pk.eyJ1IjoiY29tcHV0ZWNoIiwiYSI6InMyblMya3cifQ.P8yppesHki5qMyxTc2CNLg';
     map = L.mapbox.map('map', 'fcc.k74ed5ge', {
             attributionControl: true,
             maxZoom: 19
         })
         .setView([45, -93], 4);
		 
	 baseStreet = L.mapbox.tileLayer('fcc.k74ed5ge').addTo(map);
     baseSatellite = L.mapbox.tileLayer('fcc.k74d7n0g');
     baseTerrain = L.mapbox.tileLayer('fcc.k74cm3ol');
		 
	 L.control.scale({
         position: 'bottomright'
     }).addTo(map);

     geocoder = L.mapbox.geocoder('mapbox.places-v1');

     layerControl = new L.Control.Layers({
         'Street': baseStreet.addTo(map),
         'Satellite': baseSatellite,
         'Terrain': baseTerrain
     }, {
     }, {
		position: 'topleft'
	 }
	 ).addTo(map);

	  
	 map.on("click", function(e) {
		clickedMap(e);
	});
	  
	}
	
function clickedMap(e) {
	clickX = cursorX;
	clickY = cursorY;
	var lat = Math.round(1000000*e.latlng.lat)/1000000.0;
	var lon = Math.round(1000000*e.latlng.lng)/1000000.0;
	amrProcess(lat, lon);
}
	
function process_rows(rows) {
var arr1 = [];
for (var i = 0; i < rows.length; i++) {
arr1.push(rows[i].channel + "," + rows[i].callsign + "," + rows[i].filenumber + "," + rows[i].facility_id + "," + rows[i].service +  "," + rows[i].class + "," + rows[i].station_lat + "," + rows[i].station_lon + "," + rows[i].uuid +  "," + rows[i].area + "," + rows[i].area1);
}

arr1.sort();
arr2 = [];
var items, entry;
for (i=0; i < arr1.length; i++) {
items = arr1[i].split(",");
items[9] = Math.round(items[6]*10)/10;
items[10] = Math.round(items[7]*10)/10;
entry = {"channel": items[0], "callsign": items[1], "filenumber": items[2], "facility_id": items[3], "service": items[4], "class": items[5], "station_lat": items[6], "station_lon": items[7], "uuid": items[8], "area": items[9], "area1": items[10]};
arr2.push(entry);
}

return arr2;
}

function makeText(data, interferenceType) {
var str1 = "<table cellpadding=1><tr><td>Channel</td><td>Call</td><td>Service</td><td>fac ID</td><td>Class</td><td>Overlap</td><td>Contour Area</td><td></td></tr>\n";
for (var i = 0; i < data.length; i++) {
str1 += "<tr><td>" + data[i].channel + "</td><td>" + data[i].callsign + "</td><td>" + data[i].service + "</td><td>" + data[i].facility_id + "</td><td>" + data[i].class + "</td><td>" + data[i].area + "</td><td>" + data[i].area1 + "</td><td><span class=\"click-facility_id-class\" value=\"" + data[i].callsign + "," + data[i].class + "\" style=\"cursor: pointer; color: #aaaaff\" >Show Contour(" + data[i].facility_id + "," + data[i].class + "," + interferenceType + ")</span></td></tr>\n";
}
str1 += "</table>";

return str1;
}

function getChannels(data) {
var arr1 = [];
for (var i = 0; i < data.length; i++) {
arr1.push(parseInt(data[i].channel));
}

arr1.sort();

return arr1;
}

function contains(arr, a) {
for (var i = 0; i < arr.length; i++) {
if (a == arr[i]) {return true;}
}
return false;
}

function clearAll() {
	if (map.hasLayer(interferingContours_layer)) {
		map.removeLayer(interferingContours_layer);
	}
	if (map.hasLayer(fmContours_layer)) {
		map.removeLayer(fmContours_layer);
	}
	if (map.hasLayer(amStation_layer)) {
		map.removeLayer(amStation_layer);
	}
	$('#text-display-channel-list').html('');
	$('#info_panel').html('Info Area');

}

function processData(data) {

clearAll();

var lat = data.location.latlng.lat;
var lon = data.location.latlng.lng;
var insideUs = data.location.isInsideUs;

if (!insideUs) {
var text = "ERROR: This location (" + lat + ", " + lon + ") is outside of US"
$('#info_panel').html(text);
alert(text);
return;
}


amProcessDataNow = data;
var uuid = data.uuid;
uuid4InterferringContour = uuid;

getInterferingContours(uuid);

var data_co_usa = process_rows(data.data_co_usa);
var data_1_usa = process_rows(data.data_1_usa);
var data_23_usa = process_rows(data.data_23_usa);
var data_co_mex = process_rows(data.data_co_mex);
var data_1_mex = process_rows(data.data_1_mex);
var data_23_mex = process_rows(data.data_23_mex);
var intersectsCanada = data.intersectsCanada;
var intersectsMexico = data.intersectsMexico;
var intersectsCaribbean = data.intersectsCaribbean;

var available_co_1 = [];
for (var i = 0; i <301; i++) {
if (i < 221) {
available_co_1.push(0);
}
else {
available_co_1.push(1);
}
}

var channelInfo = {}
for (var c = 221; c < 301; c++) {
fm_info_co_usa = getFMInfo_co(c, data_co_usa);
fm_info_1_usa = getFMInfo_1(c, data_1_usa);
fm_info_23_usa = getFMInfo_23(c, data_23_usa);
fm_info_co_mex = getFMInfo_co(c, data_co_mex);
fm_info_1_mex = getFMInfo_1(c, data_1_mex);
fm_info_23_mex = getFMInfo_23(c, data_23_mex);

channelInfo[c] = {"fm_info_co_usa": fm_info_co_usa, "fm_info_1_usa": fm_info_1_usa, "fm_info_23_usa": fm_info_23_usa,
					"fm_info_co_mex": fm_info_co_mex, "fm_info_1_mex": fm_info_1_mex, "fm_info_23_mex": fm_info_23_mex
					};


}



console.log(channelInfo);

//make channel list
var channel_text = "<table class=\"channel-list-table\"><td style=\"width: 19%\">Ch</td><td style=\"width: 27%\">Co</td><td style=\"width: 27%\">First</td><td style=\"width: 27%\">2/3</td></tr>";
for (c = 221; c < 301; c++) {
//co usa
text_co = "";
for (var i = 0; i < channelInfo[c].fm_info_co_usa.length; i++) {
var facility_id = channelInfo[c].fm_info_co_usa[i].facility_id;
var uuid = channelInfo[c].fm_info_co_usa[i].uuid;
var id = c + ":" + uuid;
text_co += "<span id=\"" + id + "\" class=\"channel-list-span\">" + facility_id + "</span>, ";
}

//co mex
for (var i = 0; i < channelInfo[c].fm_info_co_mex.length; i++) {
var facility_id = channelInfo[c].fm_info_co_mex[i].facility_id;
if (facility_id == -2) {
	facility_id = "N/A";
}
var uuid = channelInfo[c].fm_info_co_mex[i].uuid;
var id = c + ":" + uuid;
text_co += "<span id=\"" + id + "\" class=\"channel-list-span\">" + facility_id + "(m)</span>, ";
}
text_co = text_co.replace(/, $/, "");

//1st usa
text_1 = "";
for (var i = 0; i < channelInfo[c].fm_info_1_usa.length; i++) {
var facility_id = channelInfo[c].fm_info_1_usa[i].facility_id;
var uuid = channelInfo[c].fm_info_1_usa[i].uuid;
var id = c + ":" + uuid;
text_1 += "<span id=\"" + id + "\" class=\"channel-list-span\">" + facility_id + "</span>, ";
}

//1st mex
for (var i = 0; i < channelInfo[c].fm_info_1_mex.length; i++) {
var facility_id = channelInfo[c].fm_info_1_mex[i].facility_id;
if (facility_id == -2) {
	facility_id = "N/A";
}
var uuid = channelInfo[c].fm_info_1_mex[i].uuid;
var id = c + ":" + uuid;
text_1 += "<span id=\"" + id + "\" class=\"channel-list-span\">" + facility_id + "(m)</span>, ";
}
text_1 = text_1.replace(/, $/, "");

//2nd/3rd usa
text_23 = "";
for (var i = 0; i < channelInfo[c].fm_info_23_usa.length; i++) {
var facility_id = channelInfo[c].fm_info_23_usa[i].facility_id;
var uuid = channelInfo[c].fm_info_23_usa[i].uuid;
var id = c + ":" + uuid;
text_23 += "<span id=\"" + id + "\" class=\"channel-list-span\">" + facility_id + "</span>, ";
}

//2nd/3rd mex
for (var i = 0; i < channelInfo[c].fm_info_23_mex.length; i++) {
var facility_id = channelInfo[c].fm_info_23_mex[i].facility_id;
if (facility_id == -2) {
	facility_id = "N/A";
}
var uuid = channelInfo[c].fm_info_23_mex[i].uuid;
var id = c + ":" + uuid;
text_23 += "<span id=\"" + id + "\" class=\"channel-list-span\">" + facility_id + "(m)</span>, ";
}
text_23 = text_23.replace(/, $/, "");


if (text_co + text_1 + text_23 == "") {
	channel_class = "yes";
}
else {
	channel_class = "no";
}

channel_text += "<tr><td><span class=\"" + channel_class + "\">" + c + "</span></td><td>" + text_co + "</td><td>" + text_1 + "</td><td>" + text_23 + "</td></tr>";

}

channel_text += "</table>";

$("#text-display-channel-list").html(channel_text);
$("#tabs-3").html(channel_text);


$('.channel-list-span').on('click', function(e) {
clickFM(e);
});

$('.yes').on('click', function(e) {
clickAvailableChannel(e);
});

//country language
var country_text = "";
if (intersectsCanada) {
	country_text = "The proposed site is close to the US/Canadian common border and the proposed \
	translator will require Canadian concurrence.  Compliance with the US/Canadian agreement may \
	further limit the channels available at this location.";
}
if (intersectsMexico) {
	country_text = "The proposed site is within 130 km of the US/Mexican common border and will require Mexican concurrence.";
}
if (intersectsCaribbean) {
	country_text = "The proposed site is in Puerto Rico or the Virgin Islands and will require notification to the \
	International Telecommunication Union.  Compliance with this process may further limit the channels available at this location.";
}

$('#text-display-country-language').html(country_text);

var availableChannelListAll = [];
var availableChannelListWaiver = [];
var index;
for (index = 221; index < 301; index++) {
	var sum_all = channelInfo[index].fm_info_co_usa.length + 
				channelInfo[index].fm_info_co_mex.length + 
				channelInfo[index].fm_info_1_usa.length + 
				channelInfo[index].fm_info_1_mex.length + 
				channelInfo[index].fm_info_23_usa.length + 
				channelInfo[index].fm_info_23_mex.length;

	var sum_waiver = channelInfo[index].fm_info_co_usa.length + 
				channelInfo[index].fm_info_co_mex.length + 
				channelInfo[index].fm_info_1_usa.length + 
				channelInfo[index].fm_info_1_mex.length +  
				channelInfo[index].fm_info_23_mex.length;
	if (sum_all == 0) {
		availableChannelListAll.push(index);
	}
	if (sum_waiver == 0) {
		availableChannelListWaiver.push(index);
	}
}				
				

var availableTableAll = makeAvailableTable(channelInfo, "all");
var availableTableWaiver = makeAvailableTable(channelInfo, "waiver");

var text = "Available Channels w/o 2/3 Waiver) [" + 
 availableChannelListAll.length + "]<br>" + availableTableAll + 
 "<br>Available Channels with 2/3 Waiver [" + availableChannelListWaiver.length +
 "]<br>" + availableTableWaiver;

$('#available-table-dispay').html(text);
$("#tabs-2").html(text);



}

function getFMInfo_co(c, data_co) {
	fm_info = [];
	for (var i = 0; i < data_co.length; i++) {
		if (data_co[i].channel == c) {
			fm_info.push(data_co[i])
		}
	}
	return fm_info;
}

function getFMInfo_1(c, data_1) {
	fm_info = [];
	for (var i = 0; i < data_1.length; i++) {
		var dif = Math.abs(c - data_1[i].channel);
		if (dif == 1) {
			fm_info.push(data_1[i])
		}
	}
	return fm_info;
}

function getFMInfo_23(c, data_23) {
	fm_info = [];
	for (var i = 0; i < data_23.length; i++) {
		var dif = Math.abs(c - data_23[i].channel);
		if (dif == 2 || dif == 3) {
			fm_info.push(data_23[i])
		}
	}
	return fm_info;
}

function clickFM(e) {
e.preventDefault();
var id = e.target.id;
var channel_impacted = id.split(":")[0];
var uuid = id.split(":")[1];

var url = host + "/fmContours/" + uuid;

	$.ajax(url, {
        type: "GET",
        url: url,
        dataType: "json",
        success: function(data){
	
			fmContoursNow = data;
			
			if (map.hasLayer(fmContours_layer)) {
				map.removeLayer(fmContours_layer);
			}
			
			fmContours_layer = L.geoJson(data, {
				style: contour_style_fm
			}).addTo(map);
			
			map.fitBounds(fmContours_layer.getBounds());
			
			//make FM contours clickable
			fmContours_layer.on("click", function(e) {
				clickedMap(e);
			});
			
			//re-plot interfering contours
			
			var class0 = data.features[0].properties.class;
			var facility_id = data.features[0].properties.facility_id;
			var filenumber = data.features[0].properties.filenumber;
			var channel = fmContoursNow.features[0].properties.channel;
			var country = fmContoursNow.features[0].properties.country;
			var callsign = fmContoursNow.features[0].properties.callsign;
			var service = fmContoursNow.features[0].properties.service;
			var station_lat = fmContoursNow.features[0].properties.station_lat;
			var station_lon = fmContoursNow.features[0].properties.station_lon;
			
			var type_str = "";
			var interferenceType = "";
			var dif = Math.abs(channel - channel_impacted);
			if (dif == 0) {
				interferenceType = "co";
				type_str = "co-channel";
			}
			else if (dif == 1) {
				interferenceType = "1";
				type_str = "1st adjacent-channel";
			}
			else if (dif == 2) {
				interferenceType = "23";
				type_str = "2nd adjacent-channel";
			}
			else if (dif == 3) {
				interferenceType = "23";
				type_str = "3rd adjacent-channel";
			}
			
			if (class0 == 'B') {
				if (interferenceType == "co") {
					dbus = [34];
				}
				else if (interferenceType == "1") {
					dbus = [48];
				}
				else if (interferenceType == "23") {
					dbus = [94];
				}
			}
			else if (class0 == 'B1') {
				if (interferenceType == "co") {
					dbus = [37];
				}
				else if (interferenceType == "1") {
					dbus = [51];
				}
				else if (interferenceType == "23") {
					dbus = [97];
				}
			}
			else if (contains(['A', 'C', 'C0', 'C1', 'C2', 'C3', 'D', 'L1', 'AA'], class0)) {
				if (interferenceType == "co") {
					dbus = [40];
				}
				else if (interferenceType == "1") {
					dbus = [54];
				}
				else if (interferenceType == "23") {
					dbus = [100];
				}
			}
				
			var features = [];
			for (var i = inerferingContoursNow.features.length-1; i >= 0; i--) {
				if (contains(dbus, inerferingContoursNow.features[i].properties.dbu)) {
					features.push(inerferingContoursNow.features[i]);
				}
			}
			var interference_geojson = {"type": "FeatureCollection", "features": features};
			
			if (map.hasLayer(interferingContours_layer)) {
				map.removeLayer(interferingContours_layer);
			}
			interferingContours_layer = L.geoJson(interference_geojson, {
				style: contour_style,
				onEachFeature: onEachFeature_interfering_contour
			}).addTo(map);
			
			map.fitBounds(interferingContours_layer.getBounds());
			
			//make interfering contours clickable
			interferingContours_layer.on("click", function(e) {
				clickedMap(e);
			});
			
			var info_text = "Channel " + channel_impacted + " is not available because of <b>" + type_str + "</b> interference with the following FM station:<br>";
			info_text += "<table border=1 cellspacing=0><tr><td>Facility ID</td><td>Call Sign</td><td>File Number</td><td>Service</td><td>Class</td><td>Channel</td><td>Country</td><td>Station Lat</td><td>Station Lon</td></tr>";
			info_text += "<tr><td>" + facility_id + "</td><td>" + callsign + "</td><td>" + filenumber + "</td><td>" + service + "</td><td>" + class0 + "</td><td>" + channel + "</td><td>" + country + "</td><td>" + station_lat + "</td><td>" + station_lon + "</td></tr></table>";
			
			
			$('#info_panel').html(info_text);
			console.log(info_text);
		

		}
			
			
			
			

	});


}

function clickAvailableChannel(e) {

var channel = e.target.innerHTML;
channelClicked = channel;

var url = host + "/fmForAvailableChannel/" + channel + "/" + uuid4InterferringContour;
console.log(url)
	$.ajax(url, {
        type: "GET",
        url: url,
        dataType: "json",
        success: function(data){
			if (data.features.length > 0) {
				if (map.hasLayer(fmContours_layer)) {
					map.removeLayer(fmContours_layer);
				}
				
				fmContours_layer = L.geoJson(data, {
					style: contour_style_fm,
					onEachFeature: onEachFeature_nearbyFM
				}).addTo(map);
				
				var text = "Channel " + channel + ": Nearby FM stations with &#177;3 channel #<p>";
				$('#info_panel').html(text);
				
				//draw interfering contours	
				if (map.hasLayer(interferingContours_layer)) {
					map.removeLayer(interferingContours_layer);
				}

				interferingContours_layer = L.geoJson(inerferingContoursNow, {
					style: contour_style,
					onEachFeature: onEachFeature_interfering_contour
				}).addTo(map);
				
				map.fitBounds(interferingContours_layer.getBounds());
				
				//make interfering contours clickable
				interferingContours_layer.on("click", function(e) {
					clickedMap(e);
				});
			
			}

			
		}
	});
}

function onEachFeature_nearbyFM(feature, layer) {
    layer.on({
        mouseover: overNearbyFM,
        mouseout: outNearbyFM
    });
}

function overNearbyFM(feature, layer) {
	var p = feature.target.feature.properties;
	var text = "Channel " + channelClicked + ": Nearby FM stations with &#177;3 channel #<p>";
	text += "Mouseover Station Info:";
	text += "<table border=1 cellspacing=0><tr><td>Facility ID</td><td>Call Sign</td><td>File Number</td><td>Service</td><td>Class</td><td>Channel</td><td>Country</td><td>Station Lat</td><td>Station Lon</td></tr>";
	text += "<tr><td>" + p.facility_id + "</td><td>" + p.callsign + "</td><td>" + p.filenumber + "</td><td>" + p.service + "</td><td>" + p.class + "</td><td>" + p.channel + "</td><td>" + p.country + "</td><td>" + p.station_lat + "</td><td>" + p.station_lon + "</td></tr></table>";
			
	
	$('#info_panel').html(text);
	//highlight interfering contours
	var dif = Math.abs(channelClicked - p.channel);
	var class0 = p.class;
	var dbu = 0;
	if (class0 == 'B') {
		if (dif == 0) {
			dbu = 34;
		}
		else if (dif == 1) {
			dbu = 48;
		}
		else if (dif >= 2) {
			dbu = 94;
		}
	
	}
	else if (class0 == 'B1') {
		if (dif == 0) {
			dbu = 37;
		}
		else if (dif == 1) {
			dbu = 51;
		}
		else if (dif >= 2) {
			dbu = 97;
		}
	
	}
	else {
		if (dif == 0) {
			dbu = 40;
		}
		else if (dif == 1) {
			dbu = 54;
		}
		else if (dif >= 2) {
			dbu = 100;
		}
	
	}
	
	var features = [];
	for (var i = inerferingContoursNow.features.length-1; i >= 0; i--) {
		if (inerferingContoursNow.features[i].properties.dbu == dbu) {
			features.push(inerferingContoursNow.features[i]);
		}
	}
	var interference_geojson = {"type": "FeatureCollection", "features": features};
	
	if (map.hasLayer(interferingContoursHighlight_layer)) {
		map.removeLayer(interferingContoursHighlight_layer);
	}
	interferingContoursHighlight_layer = L.geoJson(interference_geojson, {
		style: contour_style_highlight
	}).addTo(map);


	
console.log(text);
}

function outNearbyFM(feature, layer) {

	var text = "Channel " + channelClicked + ": Nearby FM stations with &#177;3 channel #<p>";
	$('#info_panel').html(text);
	if (map.hasLayer(interferingContoursHighlight_layer)) {
		map.removeLayer(interferingContoursHighlight_layer);
	}
}

function onEachFeature_interfering_contour(feature, layer) {
    layer.on({
        mouseover: overInterfering,
        mouseout: outInterfering
    });
}

function overInterfering(feature, layer) {
var dbu = feature.target.feature.properties.dbu;
var text = dbu + "dBu interfering contour";
$('#cursor-tip').html(text);
$('#cursor-tip').css({"top": cursorY, "left": cursorX});
}

function outInterfering(feature, layer) {
$('#cursor-tip').html("");
}



function makeAvailableTable(a) {

var text = "<table class=\"available-table\" width=100%>";
var index;
for (var row = 0; row < 8; row++) {
text += "<tr>";
for (var col=0; col<10; col++) {
index = row*10 + col + 221;

if (a[index] == 1) {
	class0 = "yes";
}
else {
	class0 = "no";
}
text += "<td align=center><span class=\"" + class0 + "\">" + index + "</span></td>"
}
text += "<tr>";
}
text += "</table>";

return text;
}

function makeAvailableTable(channelInfo, type) {

console.log(typeof(channelInfo))
console.log(channelInfo[245])

var text = "<table class=\"available-table\" width=100%>";
var index;
for (var row = 0; row < 8; row++) {
text += "<tr>";
for (var col=0; col<10; col++) {
index = row*10 + col + 221;

var sum_all = channelInfo[index].fm_info_co_usa.length + 
				channelInfo[index].fm_info_co_mex.length + 
				channelInfo[index].fm_info_1_usa.length + 
				channelInfo[index].fm_info_1_mex.length + 
				channelInfo[index].fm_info_23_usa.length + 
				channelInfo[index].fm_info_23_mex.length;

var sum_waiver = channelInfo[index].fm_info_co_usa.length + 
				channelInfo[index].fm_info_co_mex.length + 
				channelInfo[index].fm_info_1_usa.length + 
				channelInfo[index].fm_info_1_mex.length +  
				channelInfo[index].fm_info_23_mex.length;

if (type == 'all') {				
	if (sum_all == 0) {
		class0 = "yes0";
	}
	else {
		class0 = "no0";
	}
}
if (type == 'waiver') {				
	if (sum_waiver == 0) {
		class0 = "yes0";
	}
	else {
		class0 = "no0";
	}
}

text += "<td align=center><span class=\"" + class0 + "\">" + index + "</span></td>"
}
text += "<tr>";
}
text += "</table>";

return text;
}




	
function getInterferingContours(uuid) {
var url = host + "/interferingContours/" + uuid;

	$.ajax(url, {
        type: "GET",
        url: url,
        dataType: "json",
        success: function(data){
		
		if (data.features.length == 0) {
			alert("No contours available");
			return;
		}
		
		inerferingContoursNow = data;
		
		if (map.hasLayer(interferingContours_layer)) {
			map.removeLayer(interferingContours_layer);
		}
				
		if (map.hasLayer(fmContours_layer)) {
			map.removeLayer(fmContours_layer);
		}
		
		interferingContours_layer = L.geoJson(data, {
			style: contour_style,
			onEachFeature: onEachFeature_interfering_contour
		}).addTo(map);
		
		map.fitBounds(interferingContours_layer.getBounds());
		
		//make interfering contours clickable
		interferingContours_layer.on("click", function(e) {
			clickedMap(e);
		});

		}
		
	});

	
	
	
}
	
function amrProcess(lat, lon) {

	$('#lat').val(lat);
	$('#lon').val(lon);

	showLoader();
	var url = host + "/amrProcess/" + lat + "/" + lon;

	$.ajax(url, {
        type: "GET",
        url: url,
        dataType: "json",
        success: function(data){
			processData(data);
			hideLoader();
		}
	});
}
	

function showLoader() {
$('#ajax-loader').css({"top": clickY-16, "left": clickX-16});
}

function hideLoader() {
$('#ajax-loader').css({"top": "-200px", "left": "-300px"});
}

	
	
function setupListener() {

$(function() {
	$( "#tabs" ).tabs();
	$( "#tabs" ).tabs({ active: 0 });
});

 $('.btn-legend').click(function(){ 
	$(this).hide();
	$('.legend').show('fast');
});

$("#latlon-btn").on("click", function(e) {
e.preventDefault();

var lat = $('#lat').val();
var lon = $('#lon').val();

if (lat == "" || lon == "") {
alert("Please enter lat/lon");
return;
}

amrProcess(lat, lon);
});


$("#am-callsign-btn").on("click", function(e) {
e.preventDefault();

var callsign = $('#am-callsign').val().toUpperCase();

if (callsign == "") {
alert("Please call sign");
return;
}

var url = host + "/amContour/" + callsign;

	$.ajax(url, {
        type: "GET",
        url: url,
        dataType: "json",
        success: function(data){
			if (data.features.length > 0) {
				if (map.hasLayer(amStation_layer)) {
					map.removeLayer(amStation_layer);
				}
			
				amStation_layer =  L.geoJson(data, {
				style: contour_style_am_station
				}).addTo(map);
				map.fitBounds(amStation_layer.getBounds());
				amStation_layer.on("click", function(e) {
					clickedMap(e);
				});
			}
		}
	});

});

$(document).on("mousemove", function(e) {
cursorX = e.pageX;
cursorY = e.pageY;
});


}


$(document).ready(function() {
	createMap();
	setupListener();
	
});
