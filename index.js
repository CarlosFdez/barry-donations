var request = require('request'),
    util = require("util"),
    EventEmitter = require("events").EventEmitter;

function BarryDonations(options) {
    EventEmitter.call(this);

    this.options = options;

    this.validate();
}

util.inherits(BarryDonations, EventEmitter);

BarryDonations.prototype.validate = function() {
    var self = this;

    var url = 'http://don.barrycarlyon.co.uk/api.php?method=validate' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this.options.version;

    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var bodyJSON = JSON.parse(body);

            if (bodyJSON.status !== "ok") {
                console.error("[BARRY-DONATIONS] Failed to validate, API returned status: " + bodyJSON.status);
                return;
            }

            self.settings = bodyJSON.settings;

            self.init();
        } else {
            console.error("[BARRY-DONATIONS] Failed to validate: " + error);
        }
    });
};

BarryDonations.prototype.init = function() {
    var self = this;

    var url = 'http://don.barrycarlyon.co.uk/api.php?method=initial' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this.options.version;

    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var bodyJSON = JSON.parse(body);

            var latest = 0;
            // process lasttos from all transaction types to minimize data packet size
            for (var key in bodyJSON.data) {
                if (bodyJSON.data.hasOwnProperty(key)) {
                    bodyJSON.data[key].forEach(function(donation) {
                        if (donation.utos > latest) {
                            latest = donation.utos;
                        }
                    });
                }
            }

            self.options.lasttos = latest;

            self.emitInit(bodyJSON.data, latest);

            //kill any existing fetch timers
            self.kill();

            //fetch new data (delta) from the api every 30 seconds
            self._fetchtimer = setInterval(self.fetch, 30000, self);
        } else {
            console.error("[BARRY-DONATIONS] Failed to get initial data: " + error);
        }
    });
};

BarryDonations.prototype.fetch = function(scope) {
    var url = 'http://don.barrycarlyon.co.uk/api.php?method=update' +
        '&username=' + scope.options.username +
        '&password=' + scope.options.password +
        '&version=' + scope.options.version +
        '&lasttos=' + scope.options.lasttos; //make sure we fetch this freshly from

    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var bodyJSON = JSON.parse(body);

            // this will be true if any donations have a newer timestamp than "lasttos"
            if (bodyJSON.flag === false) {
                return;
            }

            var latest = 0;
            // process lasttos from all transaction types to minimize data packet size
            for (var key in bodyJSON.data) {
                if (bodyJSON.data.hasOwnProperty(key)) {
                    bodyJSON.data[key].forEach(function(donation) {
                        if (donation.utos > latest) {
                            latest = donation.utos;
                        }
                    });
                }
            }
            scope.options.lasttos = latest;

            scope.emitNewDonations(bodyJSON.data, latest);
        } else {
            console.error("[BARRY-DONATIONS] Failed to fetch update: " + error);
        }
    });
};

BarryDonations.prototype.kill = function() {
    if(this._fetchtimer !== null) {
        clearInterval(this.fetchtimer);
        this._fetchtimer = null;
    }
};

BarryDonations.prototype.emitInit = function(data, lasttos) {
    this.emit("initialized", data, lasttos);
};

BarryDonations.prototype.emitNewDonations = function(data, lasttos) {
    this.emit("newdonations", data, lasttos);
};

module.exports = BarryDonations;
