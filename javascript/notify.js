function crash () {
    if (Random.uniform()>0.999) {
        return false;
    } else {
        return true;
    }
}


function rec_make_long_poll (timeout, cur_value) {
    function okay (ok,value) {
        storage = storage_get();
        if (ok && value != storage.cur_value) {

                storage_set({"cur_value":value,
                                        "death": storage.death,
                                        "num_tabs": storage.num_tabs,
                                        "long_poll_server_down": false,
                                        "poll_server_down": storage.poll_server_down});
        }
        if (ok) {
            make_long_poll(okay, timeout, value);
        } else {
            storage_set({"cur_value":storage.cur_value,
                                        "death": storage.death,
                                        "num_tabs": storage.num_tabs,
                                        "long_poll_server_down": true,
                                        "poll_server_down": storage.poll_server_down});


            set_timeout(function  () {
                make_long_poll(okay, timeout, value);
            }, 1000*60*3);
        }


    }

    make_long_poll(okay, timeout, cur_value);
}

function close_tab() {

    storage  = storage_get();
    storage_set({"cur_value":storage.cur_value,
                                "death": true,
                                "num_tabs": storage.num_tabs-1,
                                 "long_poll_server_down": storage.long_poll_server_down,
                                "poll_server_down": storage.poll_server_down});
}

function open_tab() {

    var king = false;

    // if we are the first browser, or the only browser
    storage = storage_get();
    if (storage === null || storage.num_tabs === 0 ) {
        storage_set({"cur_value":"",
                                "death": false,
                                "num_tabs": 1,
                                "long_poll_server_down": false,
                                "poll_server_down": false});
        king = true;
    } else {

        storage_set({"cur_value":storage.cur_value,
                                "death": storage.death,
                                "num_tabs": storage.num_tabs + 1,
                                "long_poll_server_down": storage.long_poll_server_down,
                                "poll_server_down": storage.poll_server_down});
    }

    // now the king begins long polling
    if (king) {
        rec_make_long_poll( 1000 * 60 *20, storage_get().cur_value );
    }


    storage = storage_get();
    set_interval(function  () {
        storage = storage_get();
        if (storage.long_poll_server_down) {
            make_poll(function (ok, value) {
                if (ok && value != storage.cur_value) {
                    storage_set({"cur_value":value,
                                    "death": storage.death,
                                    "num_tabs": storage.num_tabs,
                                    "long_poll_server_down": storage.long_poll_server_down,
                                    "poll_server_down": false});
                    }
                }, 1000);
            }}, storage.num_tabs * 10 * 1000);



    storage_register(function  (old_value, new_value) {
        if (old_value.cur_value != new_value.cur_value) {
            notify(new_value.cur_value);

        }



        if ( new_value.death === true) {
            // if there is a death, the king will respond instantly
            if (king) {

                storage_set({"cur_value":new_value.cur_value,
                                        "death": false,
                                        "num_tabs": new_value.num_tabs,
                                        "long_poll_server_down": storage.long_poll_server_down,
                                        "poll_server_down": storage.poll_server_down});

            //  otherwise we will wait a bit to respond, and become king
            } else {
                set_timeout(function  () {
                storage = storage_get();

                // if nobody else has claimed king
                if (storage.death === true) {
                    storage_set({"cur_value":storage.cur_value,
                                        "death": false,
                                        "num_tabs": storage.num_tabs,
                                        "long_poll_server_down": storage.long_poll_server_down,
                                        "poll_server_down": storage.poll_server_down});

                    king = true;
                    rec_make_long_poll( 1000 * 60 *20, storage_get().cur_value );
                }
            }, Random.exponential(400, 100) );
            }



        }


    });

}

