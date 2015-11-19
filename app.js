
// require 

var http = require("http");
var https = require("https");
var url = require('url');
var express = require('express');
var path = require('path');
var fsr = require('file-stream-rotator');
var fs = require('fs');
var morgan = require('morgan');
var cors = require('cors');

var bodyparser = require('body-parser');
var package_json = require('./package.json');

var amr = require('./controllers/amr.js');

// **********************************************************
// config

var configEnv = require('./config/env.json');
console.log(process.cwd())

var NODE_ENV = process.env.NODE_ENV;
//console.log('NODE_ENV : '+ NODE_ENV );

var NODE_PORT =  process.env.PORT || configEnv[NODE_ENV].NODE_PORT;

// **********************************************************
// console start

console.log('package_json.name : '+ package_json.name );
console.log('package_json.version : '+ package_json.version );
console.log('package_json.description : '+ package_json.description );

//console.log('NODE_PORT : '+ NODE_PORT );
//console.log('PG_DB : '+ PG_DB );

// **********************************************************
// app

var app = express();

app.use(cors());



// **********************************************************
// log

var logDirectory = __dirname + '/log';

fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);

var accessLogStream = fsr.getStream({
    filename: logDirectory + '/fcc-pdf-%DATE%.log',
    frequency: 'daily',
    verbose: false
});

app.use(morgan('combined', {stream: accessLogStream}))

// **********************************************************
// parser

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: false }));

// **********************************************************
// route

app.use('/', express.static(__dirname + '/public'));
app.use('/api-docs', express.static(__dirname + '/public/api-docs.html'));

app.param('uuid', function(req, res, next, uuid){
    // check format of uuid
    if(!serverCheck.checkUUID(uuid)){
		return serverSend.sendErr(res, 'json', 'not_found');
    } else {
        next();
    }
})

app.param('ext', function(req, res, next, ext) {
    // check format of id
	var route = req.route.path;
	//console.log('\n  route : ' + route );
	
	if (!route === '/download/:uuid.:ext') {	// skip for downloads
		if(!serverCheck.checkExt(ext)){
			return serverSend.sendErr(res, 'json', 'invalid_ext');
		} else {
			next();
		}
	}
	else {
		next();
	}
});

app.get('/amrProcess/:lat/:lon', function(req, res){
amr.amrProcess(req, res);
});

app.get('/interferingContours/:id', function(req, res){
amr.interferingContours(req, res);
});

app.get('/fmContours/:callsign', function(req, res){
amr.fmContours(req, res);
});

app.get('/fmContours/:callsign/:class', function(req, res){
amr.fmContours(req, res);
});

app.get('/amContour/:callsign', function(req, res){
amr.amContour(req, res);
});





app.get('/contour/:serviceType/:idType/:id_format/:stationClass/:timePeriod', function(req, res){
contour.contour(req, res);
});

app.get('/contour/:serviceType/:idType/:id_format', function(req, res){
contour.contour(req, res);
});

app.get('/id/:serviceType/:idType_format', function(req, res){
contour.id(req, res);
});

app.get('/getTVContourByFilenumber/:filenumber', function(req, res){
contour.getTVContourByFilenumber(req, res);
});

app.get('/getFMContourByFilenumber/:filenumber', function(req, res){
contour.getFMContourByFilenumber(req, res);
});

app.get('/getAMContourByAntennaId/:antid/:station_class/:time_period', function(req, res){
contour.getAMContourByAntennaId(req, res);
});

app.get('/getTVContourByApplicationId/:application_id', function(req, res){
contour.getTVContourByApplicationId(req, res);
});

app.get('/getFMContourByApplicationId/:application_id', function(req, res){
contour.getFMContourByApplicationId(req, res);
});

app.get('/getTVContourByCallsign/:callsign', function(req, res){
contour.getTVContourByCallsign(req, res);
});

app.get('/getFMContourByCallsign/:callsign', function(req, res){
contour.getFMContourByCallsign(req, res);
});

app.get('/getFMContourByCallsign/:callsign', function(req, res){
contour.getFMContourByCallsign(req, res);
});

app.get('/getAMContourByCallsign/:callsign/:station_class/:time_period', function(req, res){
contour.getAMContourByCallsign(req, res);
});

app.get('/getAllTVFileNumber', function(req, res){
contour.getAllTVFileNumber(req, res);
});

app.get('/getAllFMFileNumber', function(req, res){
contour.getAllFMFileNumber(req, res);
});

app.get('/getAllTVCallsign', function(req, res){
contour.getAllTVCallsign(req, res);
});

app.get('/getAllFMCallsign', function(req, res){
contour.getAllFMCallsign(req, res);
});

app.get('/getAllTVApplicationId', function(req, res){
contour.getAllTVApplicationId(req, res);
});

app.get('/getAllFMApplicationId', function(req, res){
contour.getAllFMApplicationId(req, res);
});

app.get('/getAllAMAntennaId', function(req, res){
contour.getAllAMAntennaId(req, res);
});

app.get('/getAllAMCallsign', function(req, res){
contour.getAllAMCallsign(req, res);
});

// **********************************************************
// error

app.use(function(req, res) {

    var err_res = {};
    
    err_res.responseStatus = {
        'status': 404,
        'type': 'Not Found',
        'err': req.url +' Not Found'        
    };

    res.status(404);
    res.send(err_res);    
});

app.use(function(err, req, res, next) {
    
    //console.log('\n app.use error: ' + err );
    console.error(err.stack);
    
    var err_res = {};       
    err_res.responseStatus = {
        'status': 500,
        'type': 'Internal Server Error',
        'err': err.name +': '+ err.message      
    };  
    
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    
    res.status(500);
    res.send(err_res);
});

process.on('uncaughtException', function (err) {
    //console.log('\n uncaughtException: '+ err);
    console.error(err.stack);
});

// **********************************************************
// server

var server = app.listen(NODE_PORT, function () {

  var host = server.address().address;
  var port = server.address().port;

  console.log('\n  listening at http://%s:%s', host, port);

});

module.exports = app;