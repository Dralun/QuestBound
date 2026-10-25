import { defineComponent } from 'vue'

export const uiStubs = {
  UApp: { template: '<div><slot /></div>' },
  UIcon: true,
  USkeleton: true,
  UButton: defineComponent({
    props: ['disabled'],
    template: '<button :disabled="disabled"><slot /></button>',
  }),
  UInput: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  }),
  UModal: defineComponent({
    props: ['open', 'title', 'description'],
    template:
      '<section v-if="open" role="dialog" :aria-label="title"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><slot name="footer" /></section>',
  }),
  UAlert: defineComponent({
    props: ['title', 'description'],
    template: '<div><strong>{{ title }}</strong><p>{{ description }}</p></div>',
  }),
}
