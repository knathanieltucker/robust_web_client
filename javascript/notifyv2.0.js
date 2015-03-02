function rec_make_long_poll (timeout, cur_value) {
    function okay (ok,value) {
        if (ok && value != storage_get().cur_value) {

                storage_set({"cur_value":value});
        }
        make_long_poll(okay, timeout, value);

    }

    make_long_poll(okay, timeout, cur_value);
}



function open_tab() {

    var king = false;

    if (storage_get() === null) {
        storage_set({"cur_value":""});
        king = true;
    }

    if (king) {
        rec_make_long_poll( 1000 * 60 *20, storage_get().cur_value );
    }


    storage_register(function  (old_value, new_value) {
        if (old_value.cur_value != new_value.cur_value) {
            notify(new_value.cur_value);
        }


    });

}

