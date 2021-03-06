var request = require('request'),
    express = require('express'),
    morgan = require('morgan'),
    cors = require('cors'),
    sphereKnn = require('sphere-knn'),
    zipToLatLon = require('./zip_lat_lon.json');
var app = express();

var logger = morgan('combined');
app.use(logger);
// app.use(express.logger());

var featuresLookup = null;

var clamp = function(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

app.get('/', function(req, res) {
    return res.sendfile('index.html');
});
app.get('/points/nearby', cors(), function(req, res) {
    if (!featuresLookup) {
        return res.status(500).send({error: 'No points available.'});
    }

    var lat = null,
        lon = null;

    if (req.query.zipcode) {
        var ll = zipToLatLon[req.query.zipcode];

        if (!ll) {
            return res.status(400).send({error: 'That zipcode was not found.'});
        }

        lat = ll[0];
        lon = ll[1];
    }

    if (req.query.lat && req.query.lon) {
        lat = req.query.lat;
        lon = req.query.lon;
    }

    if (!(lat && lon)) {
        return res.status(400).send({error: 'Requires lat and lon query arg or zipcode query arg.'});
    }

    var points = featuresLookup(lat, lon),
        points = points.map(function(f) { return f[2] }),
        max_points = clamp(req.query.limit || 5, 1, 50);

    points = points.slice(0, max_points);

    return res.send({
        type: "FeatureCollection",
        features: points
    });
});

function updateGeojsonData() {
    request({
        uri: process.env.GEOJSON_URL,
        json: true
    }, function(err, resp, body) {
        if (err) {
            console.log(err);
            return;
        }

        var features = body.features.map(function (f) {
            return [
                f.geometry.coordinates[1],
                f.geometry.coordinates[0],
                f
            ]
        });
        featuresLookup = new sphereKnn(features);

        console.log("Successfully loaded " + features.length + " features.");
    });
}

var port = process.env.PORT || 5000;
app.listen(port, function() {
    if (!process.env.GEOJSON_URL) {
        console.log("No GEOJSON_URL environment variable set to load dataset.");
        throw "No GEOJSON_URL envvar set.";
    }

    console.log("Listening on " + port);

    setInterval(updateGeojsonData, 1000 * 60);
    updateGeojsonData();
});
