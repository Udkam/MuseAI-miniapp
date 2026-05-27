Component({
  properties: {
    name: { type: String, value: '' },
    category: { type: String, value: '' },
    hall: { type: String, value: '' },
    desc: { type: String, value: '' },
  },
  methods: {
    onTap: function () {
      this.triggerEvent('tap', { name: this.data.name })
    },
  },
})
