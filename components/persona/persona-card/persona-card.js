Component({
  properties: {
    personaKey: { type: String, value: 'A' },
    label: { type: String, value: '' },
    icon: { type: String, value: '' },
    desc: { type: String, value: '' },
    selected: { type: Boolean, value: false },
  },
  methods: {
    onTap: function () {
      this.triggerEvent('select', { key: this.data.personaKey })
    },
  },
})
