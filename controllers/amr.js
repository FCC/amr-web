
var geo_host = "http://amr-geoserv-tc-dev01.elasticbeanstalk.com";
var geo_space = "amr";



function amrProcess(req, res) {
var lat = req.params.lat;
var lon = req.params.lon;
	
var configEnv = require('../config/env.json');

var NODE_ENV = process.env.NODE_ENV;
var PG_DB = configEnv[NODE_ENV].PG_DB;
	
var pg = require('pg');
var client = new pg.Client(PG_DB);
client.connect();

var q = "SELECT ST_Intersects(geom, ST_Setsrid(ST_Makepoint(" + lon + "," + lat + "), 4326)) From amr.country_border WHERE iso = 'USA'"
var query = client.query(q);
var data = [];
query.on('row', function(row) {
	data.push(row);
});
query.on('end', function() {
var insideUs = data[0].st_intersects;

if (insideUs) {
	
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
				
				row_str += "('" + uuid0 + "'," + lat + "," + lon + "," + dbus[i] + "," + "ST_GeomFromText('" + multipolygon_str + "', 4326), now())" + ", ";
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
				
				row_str += "('" + uuid0 + "'," + lat + "," + lon + "," + dbus[i] + "," + "ST_Buffer(ST_MakePoint(" + lon + "," + lat + ")::geography, " + radius + ")::geometry, now()), ";
			
			}
		}
		
		row_str = row_str.replace(/, +$/, "");
		
		//insert_rows
		q = "INSERT INTO amr.interfering_contours (uuid, lat, lon ,dbu, geom, create_ts) VALUES " + row_str;
		//console.log(q);
		var query = client.query(q);

		query.on('end', function() {
			var async = require('async');
			var asyncTasks = [];
			var data_co_usa = [];
			var data_1_usa = [];
			var data_23_usa = [];
			var intersectsCanada = false;
			var intersectsMexico = false;
			var intersectsCaribbean = false;
			var data_co_mex = [];
			var data_1_mex = [];
			var data_23_mex = [];
		
			//co-channel usa
			asyncTasks.push(function(callback) {
				q = "SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 220 and a.service in ('FM', 'FL', 'FX') and a.class in ('A', 'C', 'C0', 'C1', 'C2', 'C3', 'D', 'L1') and a.country = 'US' and b.uuid = '" + uuid0 + "' and b.dbu = 40 and ST_Intersects(a.geom, b.geom) \
					union \
					SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 220 and a.service in ('FM', 'FL', 'FX') and a.class = 'B1' and a.country = 'US' and b.uuid = '" + uuid0 + "' and b.dbu = 37 and ST_Intersects(a.geom, b.geom) \
					union \
					SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 220 and a.service in ('FM', 'FL', 'FX') and a.class = 'B' and a.country = 'US' and b.uuid = '" + uuid0 + "' and b.dbu = 34 and ST_Intersects(a.geom, b.geom)";
			
				var query_co = client.query(q);
				var data = [];
				query_co.on('row', function(row) {
					data.push(row);
				});
				query_co.on('end', function() {
					console.log("co done yes");
					data_co_usa = data;
					callback();
				});
			});
			
			//first-adjacent usa
			asyncTasks.push(function(callback) {
				q = "SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 219 and a.service in ('FM', 'FL', 'FX') and a.class in ('A', 'C', 'C0', 'C1', 'C2', 'C3', 'D', 'L1') and a.country = 'US' and b.uuid = '" + uuid0 + "' and b.dbu = 54 and ST_Intersects(a.geom, b.geom) \
					union \
					SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 219 and a.service in ('FM', 'FL', 'FX') and a.class = 'B1' and a.country = 'US' and b.uuid = '" + uuid0 + "' and b.dbu = 51 and ST_Intersects(a.geom, b.geom) \
					union \
					SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 219 and a.service in ('FM', 'FL', 'FX') and a.class = 'B' and a.country = 'US' and b.uuid = '" + uuid0 + "' and b.dbu = 48 and ST_Intersects(a.geom, b.geom)";
				var query_1 = client.query(q);
				var data = [];
				query_1.on('row', function(row) {
					data.push(row);
				});
				query_1.on('end', function() {
					console.log("1st done yes");
					data_1_usa = data;
					callback();
				});
			});
			
			//2nd/3rd-adjacent usa
			asyncTasks.push(function(callback) {
				q = "SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
						FROM amr.fm_contours a, amr.interfering_contours b \
						WHERE a.channel > 217 and a.service in ('FM', 'FL', 'FX') and a.class in ('A', 'C', 'C0', 'C1', 'C2', 'C3', 'D', 'L1') and a.country = 'US' and b.uuid = '" + uuid0 + "' and b.dbu = 100 and ST_Intersects(a.geom, b.geom) \
						union \
						SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
						FROM amr.fm_contours a, amr.interfering_contours b \
						WHERE a.channel > 217 and a.service in ('FM', 'FL', 'FX') and a.class = 'B1' and a.country = 'US' and b.uuid = '" + uuid0 + "' and b.dbu = 97 and ST_Intersects(a.geom, b.geom) \
						union \
						SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
						FROM amr.fm_contours a, amr.interfering_contours b \
						WHERE a.channel > 217 and a.service in ('FM', 'FL', 'FX') and a.class = 'B' and a.country = 'US' and b.uuid = '" + uuid0 + "' and b.dbu = 94 and ST_Intersects(a.geom, b.geom)";
				var query_23 = client.query(q);
				var data = [];
				query_23.on('row', function(row) {
					data.push(row);
				});
				query_23.on('end', function() {
					data_23_usa = data;
					console.log('data 2 us dobe');
					callback();
				});
			});
			
			//34dBu intersects with Canada?
			asyncTasks.push(function(callback) {
				q = "SELECT True as intersects from amr.canada_border a, amr.interfering_contours b \
					WHERE b.uuid = '" + uuid0 + "' and b.dbu = 34 and ST_Intersects(a.geom, b.geom) is True"
				var query = client.query(q);
				var data = [];
				query.on('row', function(row) {
					data.push(row);
				});
				query.on('end', function() {
					if (data.length > 0) {
						intersectsCanada = true;
					}
					callback();
				});
			});
			
			//130km from MEX
			asyncTasks.push(function(callback) {
				q = "WITH tmp_table as \
					(SELECT ST_Buffer(st_makepoint(" + lon + "," + lat + ")::geography, 130000)::geometry as geom1) \
					SELECT True as intersects from amr.mexico_border a, tmp_table b where st_intersects(a.geom, b.geom1) is True"
			
				var query = client.query(q);
				var data = [];
				query.on('row', function(row) {
					data.push(row);
				});
				query.on('end', function() {
					if (data.length > 0) {
						intersectsMexico = true;
					}
					callback();
				});
			});
			
			
			//is caribbean
			asyncTasks.push(function(callback) {
				var q = "SELECT true as intersects FROM amr.state_2010 WHERE id in ('PR', 'VI') and ST_Intersects(geom, ST_Setsrid(ST_Makepoint(" + lon + "," + lat + "), 4326))"
			
				var query = client.query(q);
				var data = [];
				query.on('row', function(row) {
					data.push(row);
				});
				query.on('end', function() {
					console.log(data);
					if (data.length > 0) {
						intersectsCaribbean = true;
					}
					callback();
				});
			});
			
			//co-channel Mexico
			asyncTasks.push(function(callback) {
				q = "SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 220 and a.service in ('FM', 'FA', 'FR') and a.class in ('A', 'AA', 'C1', 'C', 'D') and a.country = 'MX' and b.uuid = '" + uuid0 + "' and b.dbu = 40 and ST_Intersects(a.geom, b.geom) \
					union \
					SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 220 and a.service in ('FM', 'FA', 'FR') and a.class = 'B1' and a.country = 'MX'  and b.uuid = '" + uuid0 + "' and b.dbu = 37 and ST_Intersects(a.geom, b.geom) \
					union \
					SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 220 and a.service in ('FM', 'FA', 'FR') and a.class = 'B' and a.country = 'MX'  and b.uuid = '" + uuid0 + "' and b.dbu = 34 and ST_Intersects(a.geom, b.geom)";
			
				var query = client.query(q);
				var data = [];
				query.on('row', function(row) {
					data.push(row);
				});
				query.on('end', function() {
					console.log("co mx done");
					data_co_mex = data;
					callback();
				});
			});
			
			//first-adjacent mex
			asyncTasks.push(function(callback) {
				q = "SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 219 and a.service in ('FM', 'FA', 'FR') and a.class in ('A', 'AA','C1', 'C', 'D') and a.country = 'MX' and b.uuid = '" + uuid0 + "' and b.dbu = 54 and ST_Intersects(a.geom, b.geom) \
					union \
					SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 219 and a.service in ('FM', 'FA', 'FR') and a.class = 'B1' and a.country = 'MX' and b.uuid = '" + uuid0 + "' and b.dbu = 51 and ST_Intersects(a.geom, b.geom) \
					union \
					SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
					FROM amr.fm_contours a, amr.interfering_contours b \
					WHERE a.channel > 219 and a.service in ('FM', 'FA', 'FR') and a.class = 'B' and a.country = 'MX' and b.uuid = '" + uuid0 + "' and b.dbu = 48 and ST_Intersects(a.geom, b.geom)";
				var query = client.query(q);
				var data = [];
				query.on('row', function(row) {
					data.push(row);
				});
				query.on('end', function() {
					console.log("1st done mex");
					data_1_mex = data;
					callback();
				});
			});
			
			//2nd/3rd-adjacent mex
			asyncTasks.push(function(callback) {
				q = "SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
						FROM amr.fm_contours a, amr.interfering_contours b \
						WHERE a.channel > 217 and a.service in ('FM', 'FA', 'FR') and a.class in ('A', 'AA', 'C1', 'C', 'D') and a.country = 'MX' and b.uuid = '" + uuid0 + "' and b.dbu = 100 and ST_Intersects(a.geom, b.geom) \
						union \
						SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
						FROM amr.fm_contours a, amr.interfering_contours b \
						WHERE a.channel > 217 and a.service in ('FM', 'FA', 'FR') and a.class = 'B1' and a.country = 'MX' and b.uuid = '" + uuid0 + "' and b.dbu = 97 and ST_Intersects(a.geom, b.geom) \
						union \
						SELECT a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel, a.station_lat, a.station_lon, a.uuid, ST_Area(ST_Intersection(a.geom, b.geom)::geography)/1000000 as area, ST_Area(b.geom::geography)/1000000 as area1 \
						FROM amr.fm_contours a, amr.interfering_contours b \
						WHERE a.channel > 217 and a.service in ('FM', 'FA', 'FR') and a.class = 'B' and a.country = 'MX' and b.uuid = '" + uuid0 + "' and b.dbu = 94 and ST_Intersects(a.geom, b.geom)";
				var query = client.query(q);
				var data = [];
				query.on('row', function(row) {
					data.push(row);
				});
				query.on('end', function() {
					data_23_mex = data;
					console.log('data 2 mex dobe');
					callback();
				});
			});
			
			console.log(asyncTasks);
			
			async.parallel(asyncTasks, function(){
			client.end();
				console.log('data_co');
				//console.log(data_co_usa);
				console.log('data_1');
				//console.log(data_1_usa);
				console.log('data_23');
				//console.log(data_23_usa);
				console.log('canada');
				console.log(intersectsCanada);
				console.log('mexico');
				console.log(intersectsMexico);
				console.log('data co mex');
				//console.log(data_co_mex);
				console.log('data 1 mex');
				//console.log(data_1_mex)
				var location = {"latlng": {"lat": lat, "lng": lon}, "isInsideUs": insideUs};
				var entry = {"uuid": uuid0, "data_co_usa": data_co_usa, "data_1_usa": data_1_usa, "data_23_usa": data_23_usa,
							"data_co_mex": data_co_mex, "data_1_mex": data_1_mex, "data_23_mex": data_23_mex,
							"location": location, "intersectsCanada": intersectsCanada, "intersectsMexico": intersectsMexico, "intersectsCaribbean": intersectsCaribbean};
				res.send(entry);

			});
			
		});
	}
	
}
else {
	var entry = {"location": {"latlng": {"lat": lat, "lng": lon}, "isInsideUs": insideUs}};
	res.send(entry);
}

});
	
}



function isInsideUs(lat, lon) {
var configEnv = require('../config/env.json');

var NODE_ENV = process.env.NODE_ENV;
var PG_DB = configEnv[NODE_ENV].PG_DB;
	
var pg = require('pg');
var client = new pg.Client(PG_DB);
client.connect();

var q = "SELECT ST_Intersects(geom, ST_Setsrid(ST_Makepoint(" + lon + "," + lat + "), 4326)) From amr.country_border WHERE iso = 'USA'"
var query = client.query(q);
var data = [];
query.on('row', function(row) {
	data.push(row);
});
query.on('end', function() {
var insideUs = data[0].st_intersects;
client.end();

});


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
	var url = geo_host + "/" + geo_space + "/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=" + geo_space + ":interfering_contours&maxFeatures=50&outputFormat=application%2Fjson&sortBy=dbu&cql_filter=uuid='" + uuid + "'";
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
	//var facility_id = req.params.facility_id;
	//var filenumber = req.params.filenumber;
	//if (filenumber == "null") {
		//filenumber = "";
	//}
	//var class0 = req.params.class;
	//var station_lat = req.params.station_lat;
	//var station_lon = req.params.station_lon;
	var uuid = req.params.id;
	//var url = geo_host + "/" + geo_space + "/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=" + geo_space + ":fm_contours&maxFeatures=50&outputFormat=application%2Fjson&sortBy=area+D&cql_filter=facility_id=" + facility_id + "+AND+filenumber='" + filenumber + "'+AND+class='" + class0 + "'+AND+station_lat=" + station_lat + "+AND+station_lon=" + station_lon + "+AND+service+IN+('FM','FL','FX', 'FA', 'FR')";
	var url = geo_host + "/" + geo_space + "/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=" + geo_space + ":fm_contours&maxFeatures=50&outputFormat=application%2Fjson&sortBy=area+D&cql_filter=uuid='" + uuid + "'";

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
	
	var url = geo_host + "/" + geo_space + "/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=" + 
	geo_space + ":am_contours&maxFeatures=50&outputFormat=application%2Fjson&cql_filter=callsign='" +
	callsign + "'+AND+((class='A'+AND+contour_level=2)+OR+(class IN ('B','C','D')+AND+contour_level=2))";

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

function fmForAvailableChannel(req, res) {
	var channel = parseInt(req.params.channel);
	var uuid0 = req.params.uuid0;
	var ch1 = channel - 3;
	if (ch1 < 218) {
		ch1 = 218;
	}
	var ch2 = channel + 3;
		if (ch1 > 300) {
		ch1 = 300;
	}
	var configEnv = require('../config/env.json');
	
	var NODE_ENV = process.env.NODE_ENV;
	var PG_DB = configEnv[NODE_ENV].PG_DB;
		
	var pg = require('pg');
	var client = new pg.Client(PG_DB);
	
	client.connect();

	q = "WITH tmp_table as \
		(SELECT ST_Buffer(geom::geography, 50000)::geometry as geom1 \
		FROM amr.interfering_contours WHERE uuid = '" + uuid0 + "' and dbu = 34) \
		SELECT a.uuid, a.callsign, a.filenumber, a.facility_id, a.service, a.class, a.channel \
		FROM amr.fm_contours a, tmp_table b \
		WHERE a.channel >= " + ch1 + " and a.channel <= " + ch2 + " and a.service in ('FM', 'FL', 'FX', 'FA', 'FR')  and ST_Intersects(a.geom, b.geom1) \
		ORDER BY channel";
	
	var query = client.query(q);
	var data = [];
	console.log(data);
	query.on('row', function(row) {
		data.push(row);
	});
	query.on('end', function() {
		client.end();
		var fac_file_tuple = "";
		var uuid_tuple = "";
		for (var i = 0; i < data.length; i++) {
			fac_file_tuple += "'" + data[i].facility_id + "_" + data[i].filenumber  + "',";
			uuid_tuple += "'" + data[i].uuid  + "',";
		}
		
		fac_file_tuple = "(" + fac_file_tuple.replace(/,$/, "") + ")";
		uuid_tuple = "(" + uuid_tuple.replace(/,$/, "") + ")";
		
		var url = geo_host + "/" + geo_space + "/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=" + geo_space + ":fm_contours&maxFeatures=500&outputFormat=application%2Fjson&sortBy=area+D&cql_filter=uuid+IN+" + uuid_tuple;
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
				//console.log('error');
			});


		
	
	});

	
}

function amCallsigns(req, res) {
var callsign = req.params.callsign;
var count = req.params.count;

var configEnv = require('../config/env.json');

var NODE_ENV = process.env.NODE_ENV;
var PG_DB = configEnv[NODE_ENV].PG_DB;
	
var pg = require('pg');
var client = new pg.Client(PG_DB);
client.connect();

var q = "SELECT distinct callsign FROM amr.am_contours WHERE callsign like '" + callsign + "%' ORDER BY callsign LIMIT " + count;
console.log(q);
var query = client.query(q);
var data = [];
query.on('row', function(row) {
	data.push(row);
});
query.on('end', function() {
var callsign_list = [];
for (var i = 0; i < data.length; i++) {
	callsign_list.push(data[i].callsign);
}

res.send(callsign_list);
client.end();
});


}


function allAMCallsignList(req, res) {

var configEnv = require('../config/env.json');

var NODE_ENV = process.env.NODE_ENV;
var PG_DB = configEnv[NODE_ENV].PG_DB;
	
var pg = require('pg');
var client = new pg.Client(PG_DB);
client.connect();

var q = "SELECT distinct callsign FROM amr.am_contours ORDER BY callsign";

var query = client.query(q);
var data = [];
query.on('row', function(row) {
	data.push(row);
});
query.on('end', function() {
var callsign_list = [];
for (var i = 0; i < data.length; i++) {
	callsign_list.push(data[i].callsign);
}

res.send(callsign_list);
client.end();
});

}



module.exports.amrProcess = amrProcess;
module.exports.interferingContours = interferingContours;
module.exports.fmContours = fmContours;
module.exports.amContour = amContour;
module.exports.fmForAvailableChannel = fmForAvailableChannel;
module.exports.amCallsigns = amCallsigns;
module.exports.allAMCallsignList = allAMCallsignList;

