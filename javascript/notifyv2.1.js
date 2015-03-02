


function rec_make_long_poll (timeout, cur_value) {
    function okay (ok,value) {
        storage = storage_get();
        if (ok && value != storage.cur_value) {

                storage_set({"cur_value":value,
                                        "tabs": storage.tabs});
        }
        make_long_poll(okay, timeout, value);

    }

    make_long_poll(okay, timeout, cur_value);
}

function close_tab() {

    storage  = storage_get();
    storage_set({"cur_value":storage.cur_value,
                                "death": true,
                                "num_tabs": storage.num_tabs-1    });
}

function open_tab() {

    var king = false;

    // if we are the first browser, or the only browser
    storage = storage_get();
    if (storage === null || storage.num_tabs === 0 ) {
        storage_set({"cur_value":"",
                                "death": false,
                                "num_tabs": 1    });
        king = true;
    } else {
        storage_set({"cur_value":storage.cur_value,
                                "death": storage.death,
                                "num_tabs": storage.num_tabs + 1    });
    }

    // now the king begins long polling
    if (king) {
        rec_make_long_poll( 1000 * 60 *20, storage_get().cur_value );
    }


    storage_register(function  (old_value, new_value) {
        if (old_value.cur_value != new_value.cur_value) {
            notify(new_value.cur_value);

        }

        if ( new_value.death === true) {
            // if there is a death, the king will respond instantly
            if (king) {

                storage_set({"cur_value":new_value.cur_value,
                                        "death": false,
                                        "num_tabs": new_value.num_tabs  });

            //  otherwise we will wait a bit to respond, and become king
            } else {
                set_timeout(function  () {
                storage = storage_get();

                // if nobody else has claimed king
                if (storage.death === true) {
                    storage_set({"cur_value":storage.cur_value,
                                        "death": false,
                                        "num_tabs": storage.num_tabs  });

                    king = true;
                    rec_make_long_poll( 1000 * 60 *20, storage_get().cur_value );
                }
            }, Random.exponential(400, 100) );
            }



        }


    });

}

