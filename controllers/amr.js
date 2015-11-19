
var geo_host = "http://amr-geoserv-tc-dev01.elasticbeanstalk.com";
var geo_space = "amr";

function amrProcess(req, res) {
	var lat = req.params.lat;
	var lon = req.params.lon;
	var http = require("http");
	var url = "http://ned.usgs.gov/epqs/pqs.php?x=" + lon + "&y=" + lat + "&units=Meters&output=json";
	
	http.get(url, function(res1) {
		var data = "";
		res1.on('data', function (chunk) {
			data += chunk;
		});
		res1.on("end", function() {
			processElevation(data);
		});
	}).on("error", function() {
		//res.send('error');
	});

	function processElevation(data) {
		var data = JSON.parse(data);
		var Elevation_Query = data.USGS_Elevation_Point_Query_Service;
		var elevation = Elevation_Query.Elevation_Query.Elevation;
		var rcamsl = elevation + 10; //antenna height
		rcamsl = Math.round(rcamsl*10)/10;
		
		var lat1 = Math.abs(lat)
		console.log('lat1=' + lat1);
		var dlat = Math.floor(lat1)
		var mlat = Math.floor((lat1 - dlat) * 60);
		var slat = Math.floor(Math.round((lat1 - (dlat + mlat/60.0)) * 3600))
		ns = 1
		if (lat < 0) {
			ns = -1
		}
		var lon1 = Math.abs(lon)	
		var dlon = Math.floor(lon1)
		var mlon = Math.floor((lon1 - dlon) * 60);
		var slon = Math.floor(Math.round((lon1 - (dlon + mlon/60.0)) * 3600))
		ew = 1
		if (lon < 0) {
			ew = -1
		}

		console.log(lat + ' ' + lon + ' | ' + dlat + ' ' + mlat + ' ' + slat + ' ' + ns + ' ' + dlon + ' ' + mlon + ' ' + slon + ' ' + ew + ' ' + elevation + ' ' + rcamsl)
		
		var url = "http://transition.fcc.gov/fcc-bin/haat_calculator?dlat=" + dlat + "&mlat=" + mlat + "&slat=" + slat + "&ns=" + ns + "&dlon=" + dlon + "&mlon=" + mlon + "&slon=" + slon + "&ew=" + ew + "&nad=83&rcamsl=" + rcamsl + "&nradials=360&terdb=0&text=1";

		http.get(url, function(res1) {
			var data = "";
			res1.on('data', function (chunk) {
				data += chunk;
			});
			res1.on("end", function() {
				processHaat(data);
			});
		}).on("error", function() {
			//res.send('error');
		});
	}
	
	function processHaat(data) {
		var haatData = data;
		//read haat-dist look up table
		var fs = require('fs');
		var file = "data/ht.json";
		fs.readFile(file, 'utf8', function (err,data) {
			if (err) {
				return console.log(err);
			}
			processHaat2(haatData, data);
		});
	}

		
		
	function processHaat2(haatData, ht_str) {
		var ht_json = JSON.parse(ht_str);
		console.log('json done!!!!!!!!!!!!!!!!!!!!!');
		
		var data_arr = haatData.split("\n");
		var i, j, az, dum, dum1, key0, dist, latlon, lat0, lon0;
		var haat = [];
		for (i = 0; i < data_arr.length; i++) {
			dum = data_arr[i].split("|");
			if (dum.length == 4) {
				dum1 = Math.round(parseFloat(dum[2].replace(/ +/g, "")));
				if (dum1 < 30) {
					dum1 = 30;
				}
				if (dum1 > 1500) {
					dum1 = 1500;
				}
				haat.push(dum1);
			}
		}
		
		console.log(process.cwd());
		var configEnv = require('../config/env.json');
		
		var NODE_ENV = process.env.NODE_ENV;
		var PG_DB = configEnv[NODE_ENV].PG_DB;
			
		var pg = require('pg');
		var client = new pg.Client(PG_DB);
		
		client.connect();

		var uuid = require('uuid');
		var uuid0 = uuid.v4();
		var dbus = [34, 37, 40, 48, 51, 54, 94, 97, 100]
		var row_str = "";
		for (i = 0; i < 9; i++) {
			if (dbus[i] <= 54) {
				var point_str = "";
				var polygon_str = "";
				for (az = 0; az < haat.length; az++) {
					key0 = dbus[i] + ":" + haat[az];
					dist = ht_json[key0];
					latlon = getLatLonPoint(lat, lon, az, dist);
					var lat0 = Math.round(latlon[0]*1000000)/1000000;
					var lon0 = Math.round(latlon[1]*1000000)/1000000;
					point_str = lon0 + " " + lat0;
					if (az == 0) {
						point_str_first = point_str;
					}
					polygon_str += point_str + ",";
				}
				polygon_str += point_str_first
				multipolygon_str = "MULTIPOLYGON(((" + polygon_str + ")))";
				
				row_str += "('" + uuid0 + "'," + lat + "," + lon + "," + dbus[i] + "," + "ST_GeomFromText('" + multipolygon_str + "', 4326))" + ", ";
			}
			else {
				if (dbus[i] == 94) {
					var radius = 440;
				}
				else if (dbus[i] == 97) {
					var radius = 310;
				}
				else if (dbus[i] == 100) {
					var radius = 220;
				}
				
				row_str += "('" + uuid0 + "'," + lat + "," + lon + "," + dbus[i] + "," + "ST_Buffer(ST_MakePoint(" + lon + "," + lat + ")::geography, " + radius + ")::geometry), ";
			
			
			}
		
		
		}
		
		row_str = row_str.replace(/, +$/, "");
		
		//insert_rows
		q = "INSERT INTO amr.interfering_contours (uuid, lat, lon ,dbu, geom) VALUES " + row_str;
		var query = client.query(q);
		
		//co-channel
		var data_co = [];
		q = "SELECT a.callsign, a.filenumber, a.class, a.channel, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
			FROM amr.fm_contours a, amr.interfering_contours b \
			WHERE a.channel > 220 and a.service in ('FM', 'FL', 'FX') and a.class in ('A', 'C', 'C0', 'C1', 'C2', 'C3', 'D') and b.uuid = '" + uuid0 + "' and b.dbu = 40 and ST_Intersects(a.geom, b.geom) \
			union \
			SELECT a.callsign, a.filenumber, a.class, a.channel, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
			FROM amr.fm_contours a, amr.interfering_contours b \
			WHERE a.channel > 220 and a.service in ('FM', 'FL', 'FX') and a.class = 'B' and b.uuid = '" + uuid0 + "' and b.dbu = 37 and ST_Intersects(a.geom, b.geom) \
			union \
			SELECT a.callsign, a.filenumber, a.class, a.channel, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
			FROM amr.fm_contours a, amr.interfering_contours b \
			WHERE a.channel > 220 and a.service in ('FM', 'FL', 'FX') and a.class = 'B1' and b.uuid = '" + uuid0 + "' and b.dbu = 34 and ST_Intersects(a.geom, b.geom)";
		
		var query_co = client.query(q);
		query_co.on('row', function(row) {
			data_co.push(row);
		});
		query_co.on('end', function() {
			console.log("co done");
			data_1 = [];
			q = "SELECT a.callsign, a.filenumber, a.class, a.channel, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
				FROM amr.fm_contours a, amr.interfering_contours b \
				WHERE a.channel > 219 and a.service in ('FM', 'FL', 'FX') and a.class in ('A', 'C', 'C0', 'C1', 'C2', 'C3', 'D') and b.uuid = '" + uuid0 + "' and b.dbu = 54 and ST_Intersects(a.geom, b.geom) \
				union \
				SELECT a.callsign, a.filenumber, a.class, a.channel, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
				FROM amr.fm_contours a, amr.interfering_contours b \
				WHERE a.channel > 219 and a.service in ('FM', 'FL', 'FX') and a.class = 'B' and b.uuid = '" + uuid0 + "' and b.dbu = 51 and ST_Intersects(a.geom, b.geom) \
				union \
				SELECT a.callsign, a.filenumber, a.class, a.channel, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
				FROM amr.fm_contours a, amr.interfering_contours b \
				WHERE a.channel > 219 and a.service in ('FM', 'FL', 'FX') and a.class = 'B1' and b.uuid = '" + uuid0 + "' and b.dbu = 48 and ST_Intersects(a.geom, b.geom)";
			var query_1 = client.query(q);
			query_1.on('row', function(row) {
				data_1.push(row);
			});
			query_1.on('end', function() {
				console.log("1st done");
				data_23 = [];
				q = "SELECT a.callsign, a.filenumber, a.class, a.channel, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 217 and a.channel > 220 and a.service in ('FM', 'FL', 'FX') and a.class in ('A', 'C', 'C0', 'C1', 'C2', 'C3', 'D') and b.uuid = '" + uuid0 + "' and b.dbu = 100 and ST_Intersects(a.geom, b.geom) \
					union \
					SELECT a.callsign, a.filenumber,  a.class, a.channel, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 217 and a.service in ('FM', 'FL', 'FX') and a.class = 'B' and b.uuid = '" + uuid0 + "' and b.dbu = 97 and ST_Intersects(a.geom, b.geom) \
					union \
					SELECT a.callsign, a.filenumber, a.class, a.channel, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 217 and a.service in ('FM', 'FL', 'FX') and a.class = 'B1' and b.uuid = '" + uuid0 + "' and b.dbu = 94 and ST_Intersects(a.geom, b.geom)";
				var query_23 = client.query(q);
				query_23.on('row', function(row) {
					data_23.push(row);
				});
				query_23.on('end', function() {
					var entry = {"uuid": uuid0, "data_co": data_co, "data_1": data_1, "data_23": data_23};
					res.send(entry);
					
					console.log("23 done");
				
				});
			
			});
		});
		
		console.log("done");
		
	}

}

function getLatLonPoint(lat1, lon1, az, d) {
lat1 = lat1 * Math.PI / 180.0;
lon1 = lon1 * Math.PI / 180.0;
az = az * Math.PI / 180.0;

var R = 6371.0;
var lat2 = Math.asin( Math.sin(lat1)*Math.cos(d/R) + Math.cos(lat1)*Math.sin(d/R)*Math.cos(az) );
var lon2 = lon1 + Math.atan2(Math.sin(az)*Math.sin(d/R)*Math.cos(lat1), Math.cos(d/R)-Math.sin(lat1)*Math.sin(lat2));

lat2 = lat2 * 180 / Math.PI;
lon2 = lon2 * 180 / Math.PI;

return [lat2, lon2]
}

function interferingContours(req, res) {
	var uuid = req.params.id;
	var url = geo_host + "/" + geo_space + "/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=" + geo_space + ":interfering_contours&maxFeatures=50&outputFormat=application%2Fjson&cql_filter=uuid='" + uuid + "'";
	var http = require('http');
	http.get(url, function(res1) {
		var data = "";
		res1.on('data', function (chunk) {
			data += chunk;
		});
		res1.on("end", function() {
			res.send(data);
		});
	}).on("error", function() {
			//res.send('error');
		});
	

}

function fmContours(req, res) {
	var callsign = req.params.callsign;
	var class0 = req.params.class;
	var url = geo_host + "/" + geo_space + "/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=" + geo_space + ":fm_contours&maxFeatures=50&outputFormat=application%2Fjson&cql_filter=callsign='" + callsign + "'+AND+service+IN+('FM','FL','FX')+AND+class='" + class0 + "'";

	var http = require('http');
	http.get(url, function(res1) {
		var data = "";
		res1.on('data', function (chunk) {
			data += chunk;
		});
		res1.on("end", function() {
			res.send(data);
		});
	}).on("error", function() {
			//res.send('error');
		});
}


function amContour(req, res) {
	var callsign = req.params.callsign;
	var url = geo_host + "/" + geo_space + "/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=" + geo_space + ":am_contours&maxFeatures=50&outputFormat=application%2Fjson&cql_filter=callsign='" + callsign + "'+AND+contour_level=0.25";
console.log(url);
	var http = require('http');
	http.get(url, function(res1) {
		var data = "";
		res1.on('data', function (chunk) {
			data += chunk;
		});
		res1.on("end", function() {
			res.send(data);
		});
	}).on("error", function() {
			//res.send('error');
		});
}

module.exports.amrProcess = amrProcess;
module.exports.interferingContours = interferingContours;
module.exports.fmContours = fmContours;
module.exports.amContour = amContour;
