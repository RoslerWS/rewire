import * as React from 'react';
import {
  observable,
  replace,
  defaultEquals,
  computed,
  root,
  observe
} from 'rewire-core';
import MailOutlineIcon from '@material-ui/icons/MailOutline';
import PhoneIcon       from '@material-ui/icons/Phone';
import AccessTimeIcon  from '@material-ui/icons/AccessTime';
import DateRangeIcon   from '@material-ui/icons/DateRange';
import Validator, {
  ValidationResult,
  IValidateFnData} from './Validator';
import editor, {
  EditorType,
  TextAlignment,
  IField,
} from '../components/editors';
import {and, isEmail, isRegEx} from './Validator';
import {defaultPhoneFormat, defaultPhoneMask} from '../components/PhoneField';
import { createElement } from 'react';

export type IFieldTypes = 'string' | 'static' | 'reference' | 'select' | 'number' | 'boolean' | 'date' | 'time' | 'avatar' | 'password' | 'email' | 'phone';

export interface IFieldDefn {
  label(text: string): IFieldDefn;
  placeholder(text: string): IFieldDefn;
  align(text: TextAlignment): IFieldDefn;
  autoFocus(): IFieldDefn;
  disabled(action: (field: IEditorField) => boolean): IFieldDefn;
  disableErrors(disableErrors?: boolean): IFieldDefn;
  startAdornment(adornment?: () => JSX.Element): IFieldDefn;
  endAdornment(adornment?: () => JSX.Element): IFieldDefn;
  editor(editorType: EditorType, editProps?: any): IFieldDefn;
  updateOnChange(updateOnChange?: boolean): IFieldDefn;
  validateOnUpdate(validateOnUpdate?: boolean): IFieldDefn;
  validators(fnData: IValidateFnData): IFieldDefn;
}

export interface IEditorField extends IField {
  Editor: React.SFC<any>;
  type: IFieldTypes;
  updateOnChange: boolean;
  validateOnUpdate: boolean;
  linkedFieldNames: string[];
}

export interface IFieldDefns {
  [index: string]: IFieldDefn;
}

interface IBaseFieldDefn {
  type             : IFieldTypes;
  editorType?      : EditorType;
  autoFocus?       : boolean;
  editProps?       : any;
  label?           : string;
  placeholder?     : string;
  align?           : TextAlignment;
  error?           : string;
  value?           : any;
  disabled?        : (field: IEditorField) => boolean;
  disableErrors?   : boolean;
  visible?         : boolean;
  updateOnChange?  : boolean;
  validateOnUpdate?: boolean;
  validators?      : IValidateFnData;

  startAdornment?(): JSX.Element;
  endAdornment?(): JSX.Element;
}

class BaseField implements IFieldDefn {
  typeDefn: IBaseFieldDefn;
  constructor(type: IFieldTypes, editProps?: any) {
    this.typeDefn = {type: type, editProps: editProps};
  }

  label(text: string): IFieldDefn {
    this.typeDefn.label = text;
    return this;
  }

  placeholder(text: string): IFieldDefn {
    this.typeDefn.placeholder = text;
    return this;
  }

  align(text: TextAlignment): IFieldDefn {
    this.typeDefn.align = text;
    return this;
  }

  autoFocus(): IFieldDefn {
    this.typeDefn.autoFocus = true;
    return this;
  }

  disabled(action: (field: IEditorField) => boolean): IFieldDefn {
    this.typeDefn.disabled = action;
    return this;
  }

  disableErrors(disableErrors: boolean = true): IFieldDefn {
    this.typeDefn.disableErrors = disableErrors;
    return this;
  }

  startAdornment(adornment?: () => JSX.Element): IFieldDefn {
    this.typeDefn.startAdornment = adornment;
    return this;
  }

  endAdornment(adornment?: () => JSX.Element): IFieldDefn {
    this.typeDefn.endAdornment = adornment;
    return this;
  }

  updateOnChange(updateOnChange: boolean = true): IFieldDefn {
    this.typeDefn.updateOnChange = updateOnChange;
    return this;
  }

  validateOnUpdate(validateOnUpdate: boolean = true): IFieldDefn {
    this.typeDefn.validateOnUpdate = validateOnUpdate;
    return this;
  }

  editor(editorType: EditorType, editProps?: any): IFieldDefn {
    this.typeDefn.editorType = editorType;
    if (editProps) {
      this.typeDefn.editProps = editProps;
    }
    return this;
  }

  validators(validateFnData: IValidateFnData): IFieldDefn {
    if (this.typeDefn.validators) {
      this.typeDefn.validators = and(validateFnData, this.typeDefn.validators);
    } else {
      this.typeDefn.validators = validateFnData;
    }

    return this;
  }
}

export interface IFormOptions {
  defaultAdornmentsEnabled?: boolean;
  disableErrors?: boolean;
  updateOnChange?: boolean;
  validateOnUpdate?: boolean;
}

export default class Form {
  private _value          : ObjectType;
  private dispose         : () => void;
  private _hasChanges     : () => boolean;
  private _hasErrors      : () => boolean;
  defaultAdornmentsEnabled: boolean;
  disableErrors           : boolean;
  updateOnChange          : boolean;
  validateOnUpdate        : boolean;
  fields                  : IEditorField[];
  validator               : Validator;
  field                   : {[index: string]: IEditorField};

  private constructor(fields: IFieldDefns, initial?: ObjectType, options?: IFormOptions) {
    this.field                    = observable({});
    this.validator                = new Validator();
    this.defaultAdornmentsEnabled = options && options.defaultAdornmentsEnabled !== undefined ? options.defaultAdornmentsEnabled : true;
    this.disableErrors            = options && options.disableErrors || false;
    // this.updateOnChange           = options && options.updateOnChange !== undefined ? options.updateOnChange : true;
    this.updateOnChange           = options && options.updateOnChange || false;
    this.validateOnUpdate         = options && options.validateOnUpdate !== undefined ? options.validateOnUpdate : true;
    this.initializeFields(fields);
    this.value = initial || {};
  }

  set value(value: ObjectType)  {
    if (this.dispose) this.dispose();

    this._value = value;
    this.fields.forEach(field => {
      field.value = field.type === 'boolean' ? value[field.name] || false : value[field.name];
    });

    root((dispose) => {
      this.dispose        = dispose;
      const result        = this.validator.validateFields(this.fields.map(field => field.name), this.toObjectLabelsAndValues());
      const fieldsChanged = observe(() => this.fields.map(f => f.value));
      this._hasChanges    = computed(fieldsChanged, () => {
        if (!this._value) return false;
        for (const field of this.fields) {
          if (!defaultEquals(field.value, this._value[field.name]))
            return true;
        }
        return false;
      }, false);

      this._hasErrors = computed(fieldsChanged, () => {
        if (!this._value) return false;
        const result = this.validateForm(false);
        return !result.success;
      }, !result.success);
    });
  }

  get hasChanges() {
    return this._hasChanges && this._hasChanges();
  }

  get hasErrors() {
    return this._hasErrors && this._hasErrors();
  }

  get value() {
    return this._value;
  }

  private initializeFields(fields: IFieldDefns) {
    this.fields = [];
    for (let fieldName in fields) {
      const field = fields[fieldName];
      this.fields.push(this.createField(fieldName, field as BaseField));
    }
  }

  private static editorDefaults: {[K in IFieldTypes]: EditorType} = {
    'string'   : 'text',
    'static'   : 'static',
    'select'   : 'select',
    'reference': 'auto-complete',
    'boolean'  : 'checked',
    'date'     : 'date',
    'time'     : 'time',
    'password' : 'password',
    'email'    : 'email',
    'phone'    : 'phone',
    'number'   : 'number',
    'avatar'   : 'avatar'
  };

  private createEditor(editorType: EditorType | undefined, field: IEditorField, editProps?: any): React.SFC<any> {
    if (!editorType) editorType = Form.editorDefaults[field.type];

    if (!editProps) {
      editProps = {updateOnChange: field.updateOnChange};
    } else {
      editProps['updateOnChange'] = field.updateOnChange;
    }

    const onValueChange = (v: any) => {
      field.value = v;
      if (field.validateOnUpdate) {
        this.validateField(field.name);
      }
    };

    return (props) => createElement(editor(editorType!, editProps), {...props, field: field, onValueChange});
  }

  private createField(name: string, fieldDefn: BaseField): IEditorField {
    this.field[name] = {
      name,
      autoFocus: fieldDefn.typeDefn.autoFocus,
      type: fieldDefn.typeDefn.type,
      placeholder: fieldDefn.typeDefn.placeholder,
      align: fieldDefn.typeDefn.align,
      label: fieldDefn.typeDefn.label,
      disabled: fieldDefn.typeDefn.disabled,
      disableErrors: fieldDefn.typeDefn.disableErrors !== undefined ? fieldDefn.typeDefn.disableErrors : this.disableErrors,
      updateOnChange: fieldDefn.typeDefn.updateOnChange !== undefined ? fieldDefn.typeDefn.updateOnChange : this.updateOnChange,
      validateOnUpdate: fieldDefn.typeDefn.validateOnUpdate !== undefined ? fieldDefn.typeDefn.validateOnUpdate : this.validateOnUpdate,
      visible: true,
      startAdornment: fieldDefn.typeDefn.startAdornment,
      endAdornment: fieldDefn.typeDefn.endAdornment,
      linkedFieldNames: fieldDefn.typeDefn.validators && fieldDefn.typeDefn.validators.linkedFieldNames || [],
    } as IEditorField;

    if (this.defaultAdornmentsEnabled && !Object.prototype.hasOwnProperty.call(fieldDefn.typeDefn, 'endAdornment')) {
      // add default end adornment to field depending on field type if using defaults, and it wasn't explicitly set to something (including undefined)
      switch (this.field[name].type) {
        case 'date':
          this.field[name].endAdornment = () => createElement(DateRangeIcon, undefined, undefined);
          break;
        case 'time':
          this.field[name].endAdornment = () => createElement(AccessTimeIcon, undefined, undefined);
          break;
        case 'email':
          this.field[name].endAdornment = () => createElement(MailOutlineIcon, undefined, undefined);
          break;
        case 'phone':
          this.field[name].endAdornment = () => createElement(PhoneIcon, {style: {transform: 'scaleX(-1)'}}, undefined);
          break;
        case 'password':
          this.field[name].endAdornment = () => createElement('span', undefined, undefined);
          break;
      }
    }

    this.field[name].Editor = this.createEditor(fieldDefn.typeDefn.editorType, this.field[name], fieldDefn.typeDefn.editProps);
    if (fieldDefn.typeDefn.validators) {
      this.validator.addRule(name, fieldDefn.typeDefn.validators);
    }
    return this.field[name];
  }

  private toObjectValues() {
    return this.fields.reduce((prev: ObjectType, current) => {
      if (current.value !== undefined) prev[current.name] = current.value;
      return prev;
    }, {});
  }

  private toObjectLabelsAndValues() {
    return this.fields.reduce((prev: ObjectType, current) => {
      prev[current.name] = {label: current.label && current.label.toLowerCase(), value: current.value};
      return prev;
    }, {});
  }

  private toObject() {
    return this.fields.reduce((prev: ObjectType, current) => {
      prev[current.name] = current;
      return prev;
    }, {});
  }

  public clear() {
    this.fields.forEach(field => {
      field.value = undefined;
    });
  }

  public submit = (enforceValidation: boolean = true) => {
    if (!this._value) return false;
    let result = this.validateForm();
    if (!result.success && enforceValidation) return false;
    replace(this._value, this.toObjectValues());
    return true;
  }

  private validateField(fieldName: string) {
    let fieldNamesLinkedToThisField = this.fields.filter(field => field.linkedFieldNames.includes(fieldName)).map(field => field.name);
    let fieldNamesToValidate        = [...new Set([fieldName, ...fieldNamesLinkedToThisField])];

    let result = this.validator.validateFields(fieldNamesToValidate, this.toObjectLabelsAndValues());
    fieldNamesToValidate.forEach(fieldName => {
      let field = this.field[fieldName];
      if (field) {
        field.error = result.errors[fieldName];
      }
    });

    return result;
  }

  private validateForm(produceErrors: boolean = true): ValidationResult {
    let result = this.validator.validateFields(this.fields.map(field => field.name), this.toObjectLabelsAndValues());
    if (produceErrors) {
      this.fields.forEach(field => {
        field.error = result.errors[field.name];
      });
    }
    return result;
  }

  static create<T>(fields: T, initial?: ObjectType, options?: IFormOptions) {
    type FormType = {
      field                   : Record<keyof typeof fields, IEditorField>,
      fields                  : IEditorField[],
      value                   : ObjectType,
      validation              : Validator,
      isOpen                  : boolean,
      hasChanges              : boolean,
      defaultAdornmentsEnabled: boolean,
      disableErrors           : boolean,
      updateOnChange          : boolean,
      validateOnUpdate        : boolean,

      submit(): void;
    };
    return new Form(fields as any, initial, options) as any as FormType & Form;
  }

  static string(editProps?: any): IFieldDefn {
    return new BaseField('string', editProps);
  }

  static static(): IFieldDefn {
    return new BaseField('static');
  }

  static number(editProps?: any): IFieldDefn {
    return new BaseField('number', editProps);
  }

  static boolean(editProps?: any): IFieldDefn {
    return new BaseField('boolean', editProps);
  }

  static date(editProps?: any): IFieldDefn {
    return new BaseField('date', editProps);
  }

  static time(editProps?: any): IFieldDefn {
    return new BaseField('time', editProps);
  }

  static password(editProps?: any): IFieldDefn {
    return new BaseField('password', editProps);
  }

  static email(editProps?: any): IFieldDefn {
    let field                 = new BaseField('email', editProps);
    field.typeDefn.validators = isEmail;
    return field;
  }

  static phone(editProps?: any): IFieldDefn {
    let field                 = new BaseField('phone', editProps);
    let phoneLength           = ((editProps && editProps.format) || defaultPhoneFormat).replace(new RegExp('[^#]', 'g'), '').length;
    let phoneRegEx            = new RegExp('^$|^[0-9]{' + phoneLength + '}$');
    field.typeDefn.validators = isRegEx(phoneRegEx, 'phone number is not in a valid format');
    return field;
  }

  static select(searcher: any, editProps?: any): IFieldDefn {
    let eProps = Object.assign({}, searcher, editProps);
    return new BaseField('select', eProps);
  }

  static reference(searcher: any, editProps?: any): IFieldDefn {
    let eProps = Object.assign({}, searcher, editProps);
    return new BaseField('reference', eProps);
  }

  static avatar(editProps?: any): IFieldDefn {
    return new BaseField('avatar', editProps);
  }
}
