/**
 * Wappalyzer v2
 *
 * Created by Elbert F <info@elbertf.com>
 *
 * License: GPLv3 http://www.gnu.org/licenses/gpl-3.0.txt
 */

var wappalyzer = wappalyzer || (function() {
	//'use strict';

	/**
	 * Call driver functions
	 */
	var driver = function(func, args) {
		if ( typeof w.driver[func] !== 'function' ) {
			w.log('not implemented: w.driver.' + func, 'warn');

			return;
		}

		if ( func !== 'log' ) { w.log('w.driver.' + func); }

		return w.driver[func](args);
	};

	/**
	 * Main script
	 */
	var w = {
		apps:     null,
		cats:     null,
		ping:     {},
		detected: [],

		config: {
			environment: 'dev', // dev | live

			version: false,

			websiteURL: 'http://wappalyzer.com/',
			twitterURL: 'https://twitter.com/Wappalyzer',
			githubURL:  'https://github.com/ElbertF/Wappalyzer',

			firstRun: false,
			upgraded: false
		},

		/**
		 * Log messages to console
		 */
		log: function(message, type) {
			if ( w.config.environment === 'dev' ) {
				if ( type == null ) { type = 'debug'; }

				driver('log', { message: '[wappalyzer ' + type + '] ' + message, type: type });
			}
		},

		/**
		 * Initialize
		 */
		init: function() {
			w.log('w.init');

			// Checks
			if ( w.driver == null ) {
				w.log('no driver, exiting');

				return;
			}

			// Initialize driver
			driver('init', function() {
				if ( w.config.firstRun ) {
					driver('goToURL', { url: w.config.websiteURL + 'installed' });

					w.config.firstRun = false;
				}

				if ( w.config.upgraded ) {
					driver('goToURL', { url: w.config.websiteURL + 'upgraded'  });

					w.config.upgraded = false;
				}
			});
		},

		/**
		 * Analyze the request
		 */
		analyze: function(hostname, url, data) {
			w.log('w.analyze');

			data.url = url;

			if ( w.apps == null || w.categories == null ) {
				w.log('apps.json not loaded');

				return;
			}

			if ( w.detected[url] == null ) {
				w.detected[url] = [];
			}

			var
				i, app, type, regex, match, content, meta, header,
				profiler = {
					regexCount: 0,
					startTime:  ( new Date ).getTime()
				},
				apps    = []
				;

			for ( app in w.apps ) {
				// Skip if the app has already been detected
				if ( w.detected[url].indexOf(app) !== -1 || apps.indexOf(app) !== -1 ) {
					continue;
				}

				next:

				for ( type in w.apps[app] ) {
					if ( data[type] == null ) {
						continue;
					}

					switch ( type ) {
						case 'url':
							regex = new RegExp(w.apps[app][type], 'i');

							profiler.regexCount ++;

							if ( regex.test(url) ) {
								apps.push(app);

								break next;
							}

							break;
						case 'html':
							regex = new RegExp(w.apps[app][type], 'i');

							profiler.regexCount ++;

							if ( regex.test(data[type]) ) {
								apps.push(app);

								break next;
							}

							break;
						case 'script':
							if ( data['html'] == null ) {
								break;
							}

							regex = new RegExp(w.apps[app][type], 'i');

							profiler.regexCount ++;

							while ( match = new RegExp('<script[^>]+src=("|\')([^"\']+)\1', 'ig').exec(data['html']) ) {
								profiler.regexCount ++;

								if ( regex.test(match[2]) ) {
									apps.push(app);

									break next;
								}
							}

							break;
						case 'meta':
							if ( data['html'] == null ) {
								break;
							}

							profiler.regexCount ++;

							while ( match = new RegExp('<meta[^>]+>', 'ig').exec(data['html']) ) {
								for ( meta in w.apps[app][type] ) {
									profiler.regexCount ++;

									if ( new RegExp('name=["\']' + meta + '["\']', 'i').test(match) ) {
										content = match.toString().match(/content=("|')([^"']+)("|')/i);

										regex = new RegExp(w.apps[app].meta[meta], 'i');

										profiler.regexCount ++;

										if ( content && content.length === 4 && regex.test(content[2]) ) {
											apps.push(app);

											break next;
										}
									}
								}
							}

							break;
						case 'headers':
							if ( data[type] == null ) {
								break;
							}

							for ( header in w.apps[app].headers ) {
								regex = new RegExp(w.apps[app][type][header], 'i');

								profiler.regexCount ++;

								if ( data[type][header] != null && regex.test(data[type][header]) ) {
									apps.push(app);

									break next;
								}
							}

							break;
						case 'env':
							if ( data[type] == null ) {
								break;
							}

							regex = RegExp(w.apps[app][type], 'i');

							for ( i in data[type] ) {
								profiler.regexCount ++;

								if ( regex.test(data[type][i]) ) {
									apps.push(app);

									break next;
								}
							}

							break;
					}
				}
			}

			w.log('Tested ' + profiler.regexCount + ' regular expressions in ' + ( ( ( new Date ).getTime() - profiler.startTime ) / 1000 ) + 's');

			// Implied applications
			var i, j, k, implied;

			for ( i = 0; i < 3; i ++ ) {
				for ( j in apps ) {
					if ( w.apps[apps[j]] && w.apps[apps[j]].implies ) {
						for ( k in w.apps[apps[j]].implies ) {
							implied = w.apps[apps[j]].implies[k];

							if ( !w.apps[implied] ) {
								w.log('Implied application ' + implied + ' does not exist');

								continue;
							}

							if ( w.detected[url].indexOf(implied) === -1 && apps.indexOf(implied) === -1 ) {
								apps.push(implied);
							}
						}
					}
				}
			}

			w.log(apps.length + ' apps detected: ' + apps.join(', '));

			// Keep history of detected apps
			var i, app, match;

			for ( i in apps ) {
				app = apps[i];

				// Per hostname
				if ( /^[a-z0-9._\-]+\.[a-z]+/.test(hostname) && !/(dev\.|\/admin|\.local)/.test(url) ) {
					if ( typeof w.ping.hostnames === 'undefined' ) {
						w.ping.hostnames = {};
					}

					if ( typeof w.ping.hostnames[hostname] === 'undefined' ) {
						w.ping.hostnames[hostname] = { applications: {}, meta: {} };
					}

					if ( typeof w.ping.hostnames[hostname].applications[app] === 'undefined' ) {
						w.ping.hostnames[hostname].applications[app] = 1;
					}

					w.ping.hostnames[hostname].applications[app] ++;
				}

				// Per URL
				if ( w.detected[url].indexOf(app) === -1 ) { w.detected[url].push(app); }
			}

			// Additional information
			if ( typeof w.ping.hostnames !== 'undefined' && typeof w.ping.hostnames[hostname] !== 'undefined' ) {
				if ( data.html != null ) {
					match = data.html.match(/<html[^>]*[: ]lang="([^"]+)"/);

					if ( match != null && match.length ) {
						w.ping.hostnames[hostname].meta['language'] = match[1];
					}
				}
			}

			if ( w.ping.hostnames != null && Object.keys(w.ping.hostnames).length >= 50 ) { driver('ping'); }

			apps = null;
			data = null;

			driver('displayApps');
		}
	};

	return w;
})();