// MOCK CHROME API FOR TESTING ONLY (used when running outside extension environment)
if (!window.chrome || !window.chrome.storage) {
    window.chrome = {
        runtime: {
            lastError: null,
            sendMessage: (msg, cb) => {
                if (cb) {
                    if (msg.type === 'GET_SETTINGS') {
                        cb({
                            categories: [
                                { id: 'work', name: '工作', emoji: 'briefcase', color: '#4285f4', bgColor: '#e8f0fe', keywords: [] }
                            ]
                        });
                    } else {
                        cb({});
                    }
                }
            }
        },
        storage: {
            sync: {
                _data: { categories: [{ id: 'work', name: '工作', emoji: 'briefcase', color: '#4285f4', bgColor: '#e8f0fe', keywords: [] }] },
                get: function (keys, cb) {
                    let res = {};
                    if (!keys) res = this._data;
                    else if (Array.isArray(keys)) keys.forEach(k => res[k] = this._data[k]);
                    else res[keys] = this._data[keys];
                    if (cb) cb(res);
                },
                set: function (items, cb) {
                    Object.assign(this._data, items);
                    if (cb) cb();
                }
            },
            local: {
                get: (k, cb) => { if (cb) cb({}); },
                set: (v, cb) => { if (cb) cb(); }
            }
        }
    };
}
