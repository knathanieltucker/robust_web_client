"use strict";

function open_tab() {
    // your code here; here is a simple polling-only version
    var cur_value;
    set_interval(function () {
        make_poll(function (ok, value) {
            if (ok && value != cur_value) {
                notify(value);
                cur_value = value;
            }
        }, 1000);
    }, 5000);
}

function close_tab() {
    // your code here
}

function crash () {
}

var log = (function () {
    if (typeof console === "undefined")
        return function (str) {};
    else
        return function (str) {
            console.log.apply(console.log, arguments);
        };
})();


// random number distributions
// see http://ftp.arl.mil/random/random.pdf
var Random = {
    exponential: function (a, b) {
        // range: [a,∞), mode: a,
        // median: a + b*Math.log(2), mean: a + b, variance: b*b
        return a - b * Math.log(Math.random());
    },
    normal: function (mu, sigma) {
        // range: (−∞,∞), mode: mu,
        // median: mu, mean: mu, variance: sigma*sigma
        var p, p1, p2;
        do {
            p1 = Math.random() * 2 - 1;
            p2 = Math.random() * 2 - 1;
            p = p1 * p1 + p2 * p2;
        } while (p >= 1);
        return mu + sigma * p1 * Math.sqrt(-2 * Math.log(p) / p);
    },
    lognormal: function (a, mu, sigma) {
        // range: [a,∞), mode: a + Math.exp(mu - sigma*sigma),
        // median: a + Math.exp(mu), mean: a + Math.exp(mu + sigma*sigma/2),
        // variance: Math.exp(2*mu + sigma*sigma) * (Math.exp(sigma*sigma) - 1)
        return a + Random.normal(mu, sigma);
    },
    gamma: (function () {
        var T = 4.5, D = 1 + Math.log(T), log4 = Math.log(4);
        return function (a, b, c) {
            if (c == 1)
                return Random.exponential(a, b);
            var A = 1 / Math.sqrt(2 * c - 1),
                B = c - log4,
                Q = c + 1 / A,
                C = 1 + c / Math.E,
                p, p1, p2, v, y, z, w;
            if (c < 1) {
                while (1) {
                    p = C * Math.random();
                    if (p > 1) {
                        y = -Math.log((C - p) / c);
                        if (Math.random() <= Math.pow(y, c - 1))
                            return a + b * y;
                    } else {
                        y = Math.pow(p, 1 / c);
                        if (Math.random() <= Math.exp(-y))
                            return a + b * y;
                    }
                }
            } else {
                while (1) {
                    p1 = Math.random();
                    p2 = Math.random();
                    v = A * Math.log(p1 / (1 - p1));
                    y = c * Math.exp(v);
                    z = p1 * p1 * p2;
                    w = B + Q * v - y;
                    if (w + D - T * z >= 0 || w >= Math.log(z))
                        return a + b * y;
                }
            }
        };
    })(),
    chi_square: function (df) {
        // mean: df, variance: 2 * df
        return Random.gamma(0, 2, 0.5 * df);
    },
    uniform: function (a, b) {
        if (a == null)
            return Math.random();
        else if (b == null)
            return Math.random() * a;
        else
            return a + Math.random() * (b - a);
    },
    uniform_int: function (a, b) {
        // uniform_int(a): range [0,a)
        // uniform_int(a, b): range [a,b] -- NB INCLUSIVE
        if (b == null)
            return Math.floor(Math.random() * a);
        else
            return a + Math.floor(Math.random() * (b - a + 1));
    }
};


// global object
var Global;
try {
    Global = window;
} catch (err) {
    Global = global;
}

function assert(x) {
    if (!x)
        throw new Error("assertion failed");
}

(function (base) {

// current time
var now = 1000;
// current server state
var curstate;
// current tab id
var curtab;
// configuration
var config = {
    nbrowsers_mean: 5,
    nbrowsers_sigma: 1,
    ntabs_per_browser_mean: 100,
    ntabs_per_browser_sigma: 10,
    browser_event_interval: 60000,
    tab_event_interval: 10000,
    notify_reorder_cost: 2000,
    notify_reward: 100,
    notify_reward_decay_start: 250,
    notify_reward_decay_interval: 500
};


// timers
var timerheap = [], next_tid = 1, alltimers = {};

function timerheap_less(i, j) {
    var ti = timerheap[i], tj = timerheap[j];
    return ti.when < tj.when
        || (ti.when == tj.when && ti.tid < tj.tid);
}

function timerheap_swap(i, j) {
    var x = timerheap[j];
    timerheap[j] = timerheap[i];
    timerheap[i] = x;
}

function push_timer(timer) {
    alltimers[timer.tid] = timer;
    timerheap.push(timer);
    var i = timerheap.length - 1;
    while (i > 0) {
        var j = (i - 1) >> 1;
        if (timerheap_less(j, i))
            break;
        timerheap_swap(j, i);
        i = j;
    }
}

function check_timerheap() {
    for (var i = 0; i < timerheap.length; ++i)
        for (var j = 2*i + 1; j < 2*i + 3 && j < timerheap.length; ++j)
            if (!timerheap_less(i, j)) {
                for (var x = 0; x < timerheap.length; ++x)
                    log("  " + timerheap[x].when + "@" + timerheap[x].tid + " " + (x == i || x == j ? "*" : ""));
                assert(timerheap_less(i, j));
            }
}

function add_timer(f, tabid, delay, args, interval) {
    if (typeof f !== "function" || typeof delay !== "number")
        throw new Error("add_timer arguments");
    var timer = {
        when: now + Math.max(delay, 0), f: f, args: args || [],
        tid: next_tid, tabid: tabid, interval: interval ? delay : false
    };
    ++next_tid;
    push_timer(timer);
    return timer.tid;
}

function pop_timer() {
    if (timerheap.length == 0)
        return null;
    var ret = timerheap[0], last = timerheap.pop();
    delete alltimers[ret.tid];
    if (timerheap.length) {
        timerheap[0] = last;
        var i = 0;
        while (1) {
            var smallest = i;
            for (var j = 2*i + 1; j < 2*i + 3 && j < timerheap.length; ++j)
                if (timerheap_less(j, smallest))
                    smallest = j;
            if (smallest == i)
                break;
            timerheap_swap(smallest, i);
            i = smallest;
        }
    }
    return ret;
}

base.now = function () {
    return now;
};
base.set_timeout = function (f, delay) {
    return add_timer(f, curtab, delay,
                     Array.prototype.slice.call(arguments, 2));
};
base.set_interval = function (f, delay) {
    return add_timer(f, curtab, delay,
                     Array.prototype.slice.call(arguments, 2),
                     true);
}
base.clear_timeout = function (tid) {
    if (typeof tid === "number" && tid > 0
        && alltimers[tid] && alltimers[tid].tab == curtab)
        alltimers[tid].dead = true;
};


// tabs
var tabs = {}, next_tabid = 1;
var browserlist = [], tablist = [], ntabs = 0;

function new_browser() {
    var b = {
        tabs: {},
        ntabs: 0,
        storageid: 1,
        storage: null
    };
    browserlist.push(b);
    create_tab(b);
}

function create_tab(browser) {
    var tab = {
        tabid: next_tabid,
        browser: browser,
        storage_notifiers: []
    };
    ++next_tabid;
    browser.tabs[tab.tabid] = true;
    ++browser.ntabs;
    tabs[tab.tabid] = tab;
    tablist.push(tab);
    ++ntabs;
    curtab = tab.tabid;
    open_tab();
}

function kill_tab(tabid, nonotify) {
    if (!tabs[tabid])
        return;
    if (!nonotify) {
        curtab = tabid;
        close_tab();
    }
    var tab = tabs[tabid];
    tab.dead = true;
    delete tabs[tabid];
    --ntabs;
    delete tab.browser.tabs[tabid];
    --tab.browser.ntabs;
}


// storage
function storage_notify(nnotifiers, oldval) {
    var tab = tabs[curtab], browser = tab.browser;
    if (tab.storage_notifyid != browser.storageid) {
        tab.storage_notifyid = browser.storageid;
        for (var i = 0; i < nnotifiers; ++i)
            if (tab.storage_notifiers[i])
                tab.storage_notifiers[i](oldval, browser.storage);
    }
}

base.storage_get = function () {
    return tabs[curtab].browser.storage;
};
base.storage_set = function (x) {
    var browser = tabs[curtab].browser,
        oldval = browser.storage;
    if (x && typeof x === "object" && Object.freeze)
        Object.freeze(x);
    browser.storage = x;
    ++browser.storageid;
    for (var t in browser.tabs)
        add_timer(storage_notify, t, 1, [tabs[t].storage_notifiers.length, oldval]);
};
base.storage_register = function (f) {
    if (typeof f !== "function")
        throw new Error("type error");
    tabs[curtab].storage_notifiers.push(f);
};


// network
function network_delay() {
    return Random.exponential(100, 25);
}

var npolls = 0, poll_server_up = true;

base.make_poll = function (complete, timeout) {
    var tabid = curtab;
    function request() {
        var v = poll_server_up ? curstate : null;
        add_timer(deliver, tabid, network_delay(), [v]);
    }
    function deliver(response) {
        if (complete && tabs[tabid]) {
            complete(response != null, response);
            complete = false;
        }
    }
    if (timeout > 0)
        add_timer(deliver, tabid, timeout, [null]);
    add_timer(request, tabid, network_delay());
    ++npolls;
};


var nlong_polls = 0, long_poll_server_up = true, long_polls = [];

base.make_long_poll = function (complete, timeout, value) {
    // my only change to harness, except in config
    long_poll_server_up = crash();
    var tabid = curtab;
    function request() {
        if (!long_poll_server_up || curstate != value) {
            var v = long_poll_server_up ? curstate : null;
            add_timer(deliver, tabid, network_delay(), [v]);
        } else
            long_polls.push(request);
    }
    function deliver(response) {
        if (complete && tabs[tabid]) {
            complete(response != null, response);
            complete = false;
        }
    }
    if (timeout > 0)
        add_timer(deliver, tabid, timeout, [null]);
    add_timer(request, tabid, network_delay());
    ++nlong_polls;
};


// notification statistics
var nnotify = 0, notify_delay_sum = 0, notify_delay_sumsq = 0,
    notify_new = 0, notify_duplicate = 0, notify_reverse = 0,
    notify_rewards = 0;

base.notify = function (value) {
    var m = value.match(/^state@([\d.]+)$/);
    if (!m || +m[1] >= now)
        throw new Error("bad notify value " + value + " @" + now);
    var tab = tabs[curtab], nvalue = +m[1];
    var newnote = tab.nvalue && tab.nvalue != nvalue;
    if (!tab.nvalue)
        /* first notification: don't count it */;
    else if (tab.nvalue == nvalue)
        ++notify_duplicate;
    else if (tab.nvalue > nvalue) {
        ++notify_reverse;
        notify_rewards -= config.notify_reorder_cost;
    } else {
        ++notify_new;
        notify_rewards += config.notify_reward
            * Math.pow(0.5, Math.max(0, (now - nvalue - config.notify_reward_decay_start) / config.notify_reward_decay_interval));
    }
    tab.nvalue = nvalue;
    if (newnote) {
        ++nnotify;
        notify_delay_sum += now - nvalue;
        notify_delay_sumsq += (now - nvalue) * (now - nvalue);
    }
};


// start loop to set server state
var nstate = 0, nnotify_wanted = 0;

function bump_state() {
    // print statistics
    ++nstate;
    if (nstate % 10 == 0) {
        // print statistics
        log("@" + now + ": " + nstate + " state changes");
        log("  " + browserlist.length + " open browsers, " + ntabs + " open tabs, " + nnotify + " notifications, " + (100 * nnotify / nnotify_wanted).toFixed(1) + "% notification");
        log("  " + npolls + " polls, " + nlong_polls + " long polls, " + (npolls / nstate).toFixed(1) + " polls/state");
        if (nnotify)
            log("  avg delay/notify " + (notify_delay_sum / nnotify).toFixed(0) + " ms");
        var reward = notify_rewards - 1 * npolls - 5 * nlong_polls;
        log("  $" + (60000 * reward / now).toFixed(4) + " reward/min");
    }

    // update state
    curstate = "state@" + now;
    nnotify_wanted += ntabs;

    // notify long polls
    var lp = long_polls;
    long_polls = [];
    for (var i in lp)
        lp[i]();

    // bump state later
    add_timer(bump_state, 0, Random.exponential(180000, 300000));
}

bump_state();


// start loop to create/destroy browsers
function array_remove_index(array, index) {
    array[index] = array[array.length - 1];
    array.pop();
}

function browser_event() {
    var i, b;
    // delete dead browsers
    for (i = Math.min(10, browserlist.length / 4); i > 0; --i) {
        b = Random.uniform_int(browserlist.length);
        if (browserlist[b] && browserlist[b].ntabs == 0)
            array_remove_index(browserlist, b);
    }

    // calculate desired number of browsers and take a step in that direction
    var nb = Math.round(Random.normal(config.nbrowsers_mean, config.nbrowsers_sigma));
    if (nb < browserlist.length) {
        b = Random.uniform_int(browserlist.length);
        for (var tabid in browserlist[b].tabs)
            kill_tab(tabid, true);
        array_remove_index(browserlist, b);
    } else if (nb > browserlist.length)
        new_browser();

    add_timer(browser_event, 0, Random.normal(config.browser_event_interval, config.browser_event_interval / 4));
}

add_timer(browser_event, 0, Random.normal(100, 20));


// start loop to open/close tabs
function tab_event() {
    var i, t, tidx;
    // delete dead tabs
    for (i = Math.min(10, tablist.length / 4); i > 0; --i) {
        tidx = Random.uniform_int(tablist.length);
        if (!tablist[tidx] || tablist[tidx].dead)
            array_remove_index(tablist, tidx);
    }

    // calculate desired number of tabs per browser and take a step in that direction
    tidx = Random.uniform_int(tablist.length);
    t = tablist[tidx];
    if (t && !t.dead) {
        var nt = Math.round(Random.normal(config.ntabs_per_browser_mean, config.ntabs_per_browser_sigma));
        if (nt < t.browser.ntabs)
            kill_tab(tidx, false);
        else if (nt > t.browser.ntabs)
            create_tab(t.browser);
    } else
        array_remove_index(tablist, tidx);

    add_timer(tab_event, 0, Random.normal(config.tab_event_interval, config.tab_event_interval / 4));
}

add_timer(tab_event, 0, Random.normal(50, 20));


base.step = function (ntimers) {
    ntimers = ntimers || 1000;
    var timer;
    while (ntimers >= 0 && (timer = pop_timer())) {
        assert(timer.when >= now);
        now = timer.when;
        if (!timer.dead && (!timer.tabid || tabs[timer.tabid])) {
            if (timer.interval) {
                timer.when += timer.interval;
                push_timer(timer);
            }
            curtab = timer.tabid;
            timer.f.apply(base, timer.args);
            --ntimers;

        }
    }
};

var runinterval = null;

base.run = function (go) {
    if (go == null)
        go = !runinterval;
    if (go && !runinterval)
        runinterval = setInterval(base.step, 1);
    if (!go && runinterval) {
        clearInterval(runinterval);
        runinterval = null;
    }
    return !!runinterval;
};

})(Global);


run(true);
