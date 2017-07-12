/* eslint max-statements: [2, 13] */
define(['okta/underscore', 'shared/views/BaseView'], function (_, BaseView) {

  /**
   * @class BaseInput
   * @private
   * An abstract object that defines an input for {@link Okta.Form}
   *
   * BaseInputs are typically not created directly, but being passed to {@link Okta.Form#addInput}
   * @extends Okta.View
   */

  return BaseView.extend({

    tagName: 'span',

    attributes: function () {
      return {
        'data-se': 'o-form-input-' + this.getNameString()
      };
    },

    /**
    * default placeholder text when options.placeholder is not defined
    */
    defaultPlaceholder: '',

    constructor: function (options) {
      options = _.defaults(
        options || {},
        {
          inputId: options.id || _.uniqueId('input'),
          placeholder: this.defaultPlaceholder,
          inlineValidation: true,
          validateOnlyIfDirty: false
        }
      );

      delete options.id;

      // decorate the `enable` and `disable` and toggle the `o-form-disabled` class.
      // so we wont need to worry about this when overriding the methods
      var self = this;
      _.each({enable: 'removeClass', disable: 'addClass'}, function (method, action) {
        self[action] = _.wrap(self[action], function (fn) {
          fn.apply(self, arguments);
          self.$el[method]('o-form-disabled');
        });
      });

      BaseView.call(this, options);

      if (_.result(options, 'readOnly') !== true && _.result(options, 'read') === true) {
        this.listenTo(this.model, 'change:__edit__', this.render);
      }

      if (_.isFunction(this.focus)) {
        this.focus = _.debounce(_.bind(this.focus, this), 50);
      }

      // Enable inline validation if this is not the first field in the form.
      if (!_.result(options, 'validateOnlyIfDirty')) {
        this.addInlineValidation();
      }

      this.addModelListeners();
      this.$el.addClass('o-form-input-name-' + this.getNameString());
    },
    
    addInlineValidation: function () {
      if (_.result(this.options, 'inlineValidation')) {
        this.$el.on('focusout', ':input', _.bind(this.validate, this));
      }
    },

    toModelValue: function () {
      var value = this.val();
      if (_.isFunction(this.to)) {
        value = this.to.call(this, value);
      }
      if (_.isFunction(this.options.to)) {
        value = this.options.to.call(this, value);
      }
      return value;
    },

    _isEdited: false,
    /**
     * updates the model with the input's value
     */
    update: function () {
      if (!this._isEdited && _.result(this.options, 'validateOnlyIfDirty')) {
        this._isEdited = true;
        this.addInlineValidation();
      }
      this.model.set(this.options.name, this.toModelValue());
    },

    /**
     * Is the input in edit mode
     * @return {Boolean}
     */
    isEditMode: function () {
      var ret = !_.result(this.options, 'readOnly') &&
        (_.result(this.options, 'read') !== true || this.model.get('__edit__') === true);
      return ret;
    },

    /**
     * Renders the input
     * @readonly
     */
    render: function () {
      this.preRender();
      var params = this.options.params;
      this.options.params = _.resultCtx(this.options, 'params', this);

      if (this.isEditMode()) {
        this.editMode();
        if (_.resultCtx(this.options, 'disabled', this)) {
          this.disable();
        } else {
          this.enable();
        }
      }
      else {
        this.readMode();
      }

      this.options.params = params;
      this.postRender();

      return this;
    },

    /**
     * checks if the current value in the model is valid for this field
     */
    validate: function () {
      if (!this.model.get('__pending__') && this.isEditMode() && _.isFunction(this.model.validateField)) {
        var validationError = this.model.validateField(this.options.name);
        if (validationError) {
          _.delay(function () {
            this.model.trigger('form:clear-error:' + this.options.name);
            this.model.trigger('invalid', this.model, validationError, false);
          }.bind(this), 100);
        }
      }
    },

    /**
    * Add model event listeners
    */
    addModelListeners: function () {
      this.listenTo(this.model, 'form:field-error', function (name) {
        if (this.options.name === name) {
          this.__markError();
        }
      });
      this.listenTo(this.model, 'form:clear-errors change:' + this.options.name, this.__clearError);
      this.listenTo(this.model, 'form:clear-error:' + this.options.name, this.__clearError);
    },

    /**
    * The value of the input
    * @return {Mixed}
    */
    val: function () {
      throw new Error('val() is an abstract method');
    },

    /**
    * Set focus on the input
    */
    focus: function () {
      throw new Error('focus() is an abstract method');
    },

    /**
    * Default value in read mode
    * When model has no value for the field
    */
    defaultValue: function () {
      return '';
    },

    /**
    * Renders the input in edit mode
    */
    editMode: function () {
      var options = _.extend({}, this.options, {
        value: this.getModelValue()
      });
      this.$el.html(this.template(options));
      this.options.multi && this.$el.removeClass('margin-r');
      return this;
    },

    /**
    * Renders the readable value of the input in read mode
    */
    readMode: function () {
      this.$el.text(this.getReadModeString());
      this.$el.removeClass('error-field');
      this.options.multi && this.$el.addClass('margin-r');
      return this;
    },

    getReadModeString: function () {
      var readModeStr = _.resultCtx(this.options, 'readModeString', this);
      if (readModeStr) {
        return readModeStr;
      }
      return this.toStringValue();
    },

    /**
     * The model value off the field associated with the input
     * @return {Mixed}
     */
    getModelValue: function () {
      var value = this.model.get(this.options.name);

      if (_.isFunction(this.from)) {
        value = this.from.call(this, value);
      }
      if (_.isFunction(this.options.from)) {
        value = this.options.from.call(this, value);
      }
      return value;
    },

    /*
    * convenience method to get the textual value from the model
    * will return the textual label rather than value in case of select/radio
    * @return {String}
    */
    toStringValue: function () {
      var value = this.getModelValue();
      if (this.options.options) { // dropdown or radio
        value = this.options.options[value];
      }
      return value || this.defaultValue();
    },

    /**
     * Triggers a form:resize event in order to tell dialogs content size has changed
     */
    resize: function () {
      this.model.trigger('form:resize');
    },

    /**
     * Disable the input
     */
    disable: function () {
      this.$(':input').prop('disabled', true);
    },

    /**
     * Enable the input
     */
    enable: function () {
      this.$(':input').prop('disabled', false);
    },

    /**
     * Change the type of the input field. (e.g., text <--> password)
     * @param type
     */
    changeType: function (type) {
      this.$(':input').prop('type', type);
      // Update the options so that it keeps the uptodate state
      this.options.type = type;
    },

    getNameString: function () {
      if (_.isArray(this.options.name)) {
        return this.options.name.join('-');
      }
      return this.options.name;
    },

    /**
     * Get parameters, computing _.result
     * @param  {[type]} options alternative options
     * @return {Object} the params
     */
    getParams: function (options) {
      var opts = options || this.options || {};
      return _.clone(_.resultCtx(opts, 'params', this) || {});
    },

    /**
     * get a parameter from options.params, compute _.result when needed.
     * @param  {String} key
     * @param  {Object} defaultValue
     * @return {Object} the params
     */
    getParam: function (key, defaultValue) {
      var result = _.resultCtx(this.getParams(), key, this);
      return !_.isUndefined(result) ? result : defaultValue;
    },

    /**
     * Get a parameter from options.params or if empty, object attribute.
     *
     * @param  {String} key
     * @return {Object} the param or attribute
     */
    getParamOrAttribute: function (key) {
      return this.getParam(key) || _.result(this, key);
    },

    __markError: function () {
      this.$el.addClass('o-form-has-errors');
    },

    __clearError: function () {
      this.$el.removeClass('o-form-has-errors');
    }

  });

});
