(function () {
  'use strict';

  /**
   * @ngdoc overview
   * @name ui.grid.importer
   * @description
   *
   *  # ui.grid.importer
   * This module provides the ability to import data into the grid. It
   * uses the column defs to work out which data belongs in which column, 
   * and creates entities from a configured class (typically a $resource).
   * 
   * If the rowEdit feature is enabled, it also calls save on those newly 
   * created objects, and then displays any errors in the imported data.  
   * 
   * Currently the importer imports only CSV and json files, although provision has been
   * made to process other file formats, and these can be added over time.  
   * 
   * For json files, the properties within each object in the json must match the column names
   * (to put it another way, the importer doesn't process the json, it just copies the objects
   * within the json into a new instance of the specified object type)
   * 
   * For CSV import, the default column identification relies on each column in the
   * header row matching a column.name or column.displayName. Optionally, a column identification 
   * callback can be used.  This allows matching using other attributes, which is particularly
   * useful if your application has internationalised column headings (i.e. the headings that 
   * the user sees don't match the column names).
   * 
   * The importer makes use of the grid menu as the UI for requesting an
   * import. 
   *
   * <div ui-grid-importer></div>
   */

  var module = angular.module('ui.grid.importer', ['ui.grid']);

  /**
   *  @ngdoc object
   *  @name ui.grid.importer.constant:uiGridImporterConstants
   *
   *  @description constants available in importer module
   */

  module.constant('uiGridImporterConstants', {
    featureName: 'importer'
  });

  /**
   *  @ngdoc service
   *  @name ui.grid.importer.service:uiGridImporterService
   *
   *  @description Services for importer feature
   */
  module.service('uiGridImporterService', ['$log', '$q', 'uiGridImporterConstants', 'gridUtil', '$compile', '$interval', 'i18nService', '$window',
    function ($log, $q, uiGridImporterConstants, gridUtil, $compile, $interval, i18nService, $window) {

      var service = {

        initializeGrid: function (grid) {

          //add feature namespace and any properties to grid for needed state
          grid.importer = {};
          
          this.defaultGridOptions(grid.options);

          /**
           *  @ngdoc object
           *  @name ui.grid.importer.api:PublicApi
           *
           *  @description Public Api for importer feature
           */
          var publicApi = {
            events: {
              importer: {
              }
            },
            methods: {
              importer: {
                /**
                 * @ngdoc function
                 * @name importFile
                 * @methodOf  ui.grid.importer.api:PublicApi
                 * @description Imports a file into the grid using the file object 
                 * provided.  Bypasses the grid menu
                 * @param {Grid} grid the grid we're importing into
                 * @param {File} fileObject the file we want to import, as a javascript
                 * File object
                 */
                importFile: function ( grid, fileObject ) {
                  service.importFile( grid, fileObject );
                }
              }
            }
          };

          grid.api.registerEventsFromObject(publicApi.events);

          grid.api.registerMethodsFromObject(publicApi.methods);

          if (grid.api.core.addToGridMenu){
            service.addToMenu( grid );
          } else {
            // order of registration is not guaranteed, register in a little while
            $interval( function() {
              if (grid.api.core.addToGridMenu){
                service.addToMenu( grid );
              }             
            }, 100, 1);
          }
        },
        

        defaultGridOptions: function (gridOptions) {
          //default option to true unless it was explicitly set to false
          /**
           * @ngdoc object
           * @name ui.grid.importer.api:GridOptions
           *
           * @description GridOptions for importer feature, these are available to be  
           * set using the ui-grid {@link ui.grid.class:GridOptions gridOptions}
           */

          /**
           * @ngdoc property
           * @propertyOf ui.grid.importer.api:GridOptions
           * @name enableImporter
           * @description Whether or not importer is enabled.  Automatically set
           * to false if the user's browser does not support the required fileApi.
           * Otherwise defaults to true.
           * 
           */
          if (gridOptions.enableImporter  || gridOptions.enableImporter === undefined){
            if ( !(window.File && window.FileReader && window.FileList && window.Blob)) {
              $log.error('The File APIs are not fully supported in this browser, grid importer cannot be used.');
              this.grid.options.enableImporter = false;
            } else {
              gridOptions.enableImporter = true;
            }
          } else {
            gridOptions.enableImporter = false;
          }
          
          /**
           * @ngdoc method
           * @name importerProcessHeaders
           * @methodOf ui.grid.importer.api:GridOptions
           * @description A callback function that will process headers using custom
           * logic.  Set this callback function if the headers that your user will provide in their 
           * import file don't necessarily match the grid header or field names.  This might commonly
           * occur where your application is internationalised, and therefore the field names
           * that the user recognises are in a different language than the field names that
           * ui-grid knows about.
           * 
           * Defaults to the internal `processHeaders` method, which seeks to match using both
           * displayName and column.name.  Any non-matching columns are discarded.
           * 
           * Your callback routine should respond by processing the header array, and returning an array
           * of matching column names.  A null value in any given position means "don't import this column"
           * 
           * <pre>
           *      gridOptions.importerProcessHeaders: function( headerArray ) {
           *        var myHeaderColumns = [];
           *        var thisCol;
           *        headerArray.forEach( function( value, index ) {
           *          thisCol = mySpecialLookupFunction( value );
           *          myHeaderColumns.push( thisCol.name ); 
           *        });
           *        
           *        return myHeaderCols;
           *      })
           * </pre>
           * @param {Grid} grid the grid we're importing into
           * @param {array} headerArray an array of the text from the first row of the csv file,
           * which you need to match to column.names
           * @returns {array} array of matching column names, in the same order as the headerArray
           * 
           */
          gridOptions.importerProcessHeaders = gridOptions.importerProcessHeaders || service.processHeaders;

          /**
           * @ngdoc method
           * @name importerErrorCallback
           * @methodOf ui.grid.importer.api:GridOptions
           * @description A callback function that provides custom error handling, rather
           * than the standard grid behaviour of an alert box and a console message.  You 
           * might use this to internationalise the console log messages, or to write to a 
           * custom logging routine that returned errors to the server.
           * 
           * <pre>
           *      gridOptions.importerErrorCallback: function( grid, errorKey, consoleMessage, context ) {
           *        myUserDisplayRoutine( errorKey );
           *        myLoggingRoutine( consoleMessage, context );
           *      })
           * </pre>
           * @param {Grid} grid the grid we're importing into, may be useful if you're positioning messages
           * in some way
           * @param {string} errorKey one of the i18n keys the importer can return - importer.noHeaders, 
           * importer.noObjects, importer.invalidCsv, importer.invalidJson, importer.jsonNotArray
           * @param {string} consoleMessage the English console message that importer would have written
           * @param {object} context the context data that importer would have appended to that console message,
           * often the file content itself or the element that is in error
           * 
           */
          if ( !gridOptions.importerErrorCallback ||  typeof(gridOptions.importerErrorCallback) !== 'function' ){
            delete gridOptions.importerErrorCallback;  
          }
          
          /**
           * @ngdoc object
           * @name importerNewObject
           * @propertyOf  ui.grid.importer.api:GridOptions
           * @description An object on which we call `new` to create each new row before inserting it into
           * the data array.  Typically this would be a $resource entity, which means that if you're using 
           * the rowEdit feature, you can directly call save on this entity when the save event is triggered.
           * 
           * Defaults to a vanilla javascript object
           * 
           * @example
           * <pre>
           *   gridOptions.importerNewObject = MyRes;
           * </pre>
           * 
           */

          /**
           * @ngdoc property
           * @propertyOf ui.grid.importer.api:GridOptions
           * @name importerShowMenu
           * @description Whether or not to show an item in the grid menu.  If an item
           * is to be shown in the grid menu then an `importerInputElement` must be 
           * provided as well.  If there is no `importerInputElement` then the menu
           * will be automatically suppressed, otherwise defaults to true.
           * 
           */
          if ( gridOptions.enableImporter && ( !gridOptions.importerInputElement || !gridOptions.importerInputElement.append ) ) {
            gridOptions.importerShowMenu = false;
          } else {
            gridOptions.importerShowMenu = gridOptions.importerShowMenu !== false;
          }
        },


        /**
         * @ngdoc function
         * @name addToMenu
         * @methodOf  ui.grid.importer.service:uiGridImporterService
         * @description Adds import menu item to the grid menu,
         * allowing the user to request import of a file 
         * @param {Grid} grid the grid into which data should be imported
         */
        addToMenu: function ( grid ) {
          grid.api.core.addToGridMenu( grid, [
            {
              title: i18nService.getSafeText('gridMenu.importerTitle')
            },
            {
              templateUrl: 'ui-grid/importerMenuItemContainer',
              action: function ($event) {
                this.grid.api.importer.importAFile( grid );
              }
            }
          ]);
        },
        
        
        /**
         * @ngdoc function
         * @name importThisFile
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Imports the provided file into the grid using the file object 
         * provided.  Bypasses the grid menu
         * @param {Grid} grid the grid we're importing into
         * @param {File} fileObject the file we want to import, as returned from the File
         * javascript object
         */
        importThisFile: function ( grid, fileObject ) {
          if (!fileObject){
            $log.error( 'No file object provided to importThisFile, should be impossible, aborting');
            return;
          }
          
          var reader = new FileReader();
          
          switch ( fileObject.type ){
            case 'application/json':
              reader.onload = service.importJsonClosure( grid );
              break;
            default:
              reader.onload = service.importCsvClosure( grid );
              break;
          }
          
          reader.readAsText( fileObject );
        },
        
        
        /**
         * @ngdoc function
         * @name importJson
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Creates a function that imports a json file into the grid.
         * The json data is imported into new objects of type `gridOptions.importerNewObject`,
         * and ift he rowEdit feature is enabled the rows are marked as dirty
         * @param {Grid} grid the grid we want to import into
         * @param {FileObject} importFile the file that we want to import, as 
         * a FileObject
         */
        importJsonClosure: function( grid ) {
          return function( importFile ){
            var newObjects = [];
            var newObject;
            
            angular.forEach( service.parseJson( grid, importFile ), function( value, index ) {
              newObject = service.newObject( grid );
              angular.extend( newObject, value );
              newObjects.push( newObject );
            });
            
            service.addObjects( grid, newObjects );
            
          };
        },


        /**
         * @ngdoc function
         * @name parseJson
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Parses a json file, returns the parsed data.
         * Displays an error if file doesn't parse
         * @param {Grid} grid the grid that we want to import into 
         * @param {FileObject} importFile the file that we want to import, as 
         * a FileObject
         * @returns {array} array of objects from the imported json
         */
        parseJson: function( grid, importFile ){
          var loadedObjects;
          try {
            loadedObjects = JSON.parse( importFile.target.result );
          } catch (e) {
            service.alertError( grid, 'importer.invalidJson', 'File could not be processed, is it valid json? Content was: ', importFile.target.result );
            return;
          }
          
          if ( !Array.isArray( loadedObjects ) ){
            service.alertError( grid, 'importer.jsonNotarray', 'Import failed, file is not an array, file was: ', importFile.target.result );
            return [];
          } else {
            return loadedObjects;
          }
        },
        
        
        
        /**
         * @ngdoc function
         * @name importCsvClosure
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Creates a function that imports a csv file into the grid
         * (allowing it to be used in the reader.onload event)
         * @param {Grid} grid the grid that we want to import into 
         * @param {FileObject} importFile the file that we want to import, as 
         * a file object
         */
        importCsvClosure: function( grid ) {
          return function( importFile ){
            var importArray = service.parseCsv( importFile );
            if ( !importArray || importArray.length < 1 ){ 
              service.alertError( grid, 'importer.invalidCsv', 'File could not be processed, is it valid csv? Content was: ', importFile.target.result );
              return; 
            }
            
            var newObjects = service.createCsvObjects( grid, importArray );
            if ( !newObjects || newObjects.length === 0 ){
              service.alertError( grid, 'importer.noObjects', 'Objects were not able to be derived, content was: ', importFile.target.result );
              return;
            }
            
            service.addObjects( grid, newObjects );
          };
        },
        
        
        /**
         * @ngdoc function
         * @name parseCsv
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Parses a csv file into an array of arrays, with the first
         * array being the headers, and the remaining arrays being the data.
         * The logic for this comes from https://github.com/thetalecrafter/excel.js/blob/master/src/csv.js, 
         * which is noted as being under the MIT license.  The code is modified to pass the jscs yoda condition
         * checker
         * @param {FileObject} importFile the file that we want to import, as a 
         * file object
         */
        parseCsv: function( importFile ) {
          var csv = importFile.target.result;
          
          var reviver = function(r, c, v) { return v; };
          var chars = csv.split(''), c = 0, cc = chars.length, start, end, table = [], row;
          while (c < cc) {
            table.push(row = []);
            while (c < cc && chars[c] !== '\r' && chars[c] !== '\n' ) {
              start = end = c;
              if ( chars[c] === '"'){
                start = end = ++c;
                while (c < cc) {
                  if ( chars[c] === '"' ) {
                    if ( chars[c+1] !== '"') { break; }
                    else { chars[++c] = ''; } // unescape ""
                  }
                  end = ++c;
                }
                if ( chars[c] === '"' ) { ++c; }
                while (c < cc && chars[c] !== '\r' && chars[c] !== '\n' && chars[c] !== ',') { ++c; }
              } else {
                while (c < cc && chars[c] !== '\r' && chars[c] !== '\n' && chars[c] !== ',') { end = ++c; }
              }
              end = reviver(table.length-1, row.length, chars.slice(start, end).join(''));
              row.push(isNaN(end) ? end : +end);
              if (chars[c] === ',') { ++c; }
            }
            if (chars[c] === '\r') { ++c; }
            if (chars[c] === '\n') { ++c; }
          }
          return table;
        },
        

        /**
         * @ngdoc function
         * @name createCsvObjects
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Converts an array of arrays (representing the csv file)
         * into a set of objects.  Uses the provided `gridOptions.importerNewObject`
         * to create the objects, and maps the header row into the individual columns 
         * using either `gridOptions.importerProcessHeaders`, or by using a native method
         * of matching to either the displayName, column name or column field of
         * the columns in the column defs.  The resulting objects will have attributes
         * that are named based on the column.field or column.name, in that order.
         * @param {Grid} grid the grid that we want to import into 
         * @param {FileObject} importFile the file that we want to import, as a 
         * file object
         */
        createCsvObjects: function( grid, importArray ){
          // pull off header row and turn into headers
          var headerMapping = grid.options.importerProcessHeaders( grid, importArray.shift() );
          if ( !headerMapping || headerMapping.length === 0 ){
            service.alertError( grid, 'importer.noHeaders', 'Column names could not be derived, content was: ', importArray );
            return [];
          }
          
          var newObjects = [];
          var newObject;
          angular.forEach( importArray, function( row, index ) {
            newObject = service.newObject( grid );
            angular.forEach( row, function( field, index ){
              if ( headerMapping[index] !== null ){
                newObject[ headerMapping[index] ] = field;
              }
            });
            
            newObjects.push( newObject );
          });
          
          return newObjects;
        },
        
        
        /**
         * @ngdoc function
         * @name processHeaders
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Determines the columns that the header row from
         * a csv (or other) file represents.
         * @param {Grid} grid the grid we're importing into
         * @param {array} headerRow the header row that we wish to match against
         * the column definitions
         * @returns {array} an array of the attribute names that should be used
         * for that column, based on matching the headers or creating the headers
         * 
         */
        processHeaders: function( grid, headerRow ) {
          var headers = [];
          if ( !grid.options.columnDefs || grid.options.columnDefs.length === 0 ){
            // we are going to create new columnDefs for all these columns, so just remove
            // spaces from the names to create fields
            angular.forEach( headerRow, function( value, index ) {
              headers.push( value.replace( /[^0-9a-zA-Z\-_]/g, '_' ) );
            });
            return headers;
          } else {
            var lookupHash = service.flattenColumnDefs( grid.options.columnDefs );
            angular.forEach( headerRow, function( value, index ) {
              if ( lookupHash[value] ) {
                headers.push( lookupHash[value] );
              } else {
                headers.push( null );
              }
            });
            return headers;
          }
        },
        
        
        /**
         * @name flattenColumnDefs
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Runs through the column defs and creates a hash of
         * the displayName, name and field, with each pointing to the field or name
         * (whichever is present).  Used to lookup column headers and decide what 
         * attribute name to give to the resulting field. 
         * @param {array} columnDefs the columnDefs that we should flatten
         */
        flattenColumnDefs: function( columnDefs ){
          var flattenedHash = {};
          angular.forEach( columnDefs, function( columnDef, index) {
            if ( columnDef.name ){
              flattenedHash[ columnDef.name ] = columnDef.field || columnDef.name;
            }
            
            if ( columnDef.field ){
              flattenedHash[ columnDef.field ] = columnDef.field || columnDef.name;
            }
            
            if ( columnDef.displayName ){
              flattenedHash[ columnDef.displayName ] = columnDef.field || columnDef.name;
            }
          });
          
          return flattenedHash;
        },
        
        
        /**
         * @ngdoc function
         * @name addObjects
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Inserts our new objects into the grid data, and
         * sets the rows to dirty if the rowEdit feature is being used
         * 
         * @param {Grid} grid the grid we're importing into
         * @param {array} newObjects the objects we want to insert into the grid data
         * @returns {object} the new object
         */
        addObjects: function( grid, newObjects ){
          grid.options.data = grid.options.data.concat( newObjects );
          
          // This block replicates the data watch, but shouldn't be necessary in an ideal world
          var promises = [];
          if (grid.columns.length === ( grid.rowHeaderColumns ? grid.rowHeaderColumns.length : 0 ) ) {
            if (grid.options.columnDefs.length === 0) {
              grid.buildColumnDefsFromData(grid.options.data);
            }
            promises.push(grid.buildColumns()
              .then(function() {
                grid.preCompileCellTemplates();}
            ));
          }

          $q.all(promises).then(function() {
            grid.modifyRows(grid.options.data)
              .then(function () {
                  grid.redrawInPlace();
                  grid.refreshCanvas(true);
                  if ( grid.api.rowEdit ){
                    grid.api.rowEdit.setRowsDirty( grid, newObjects );
                  }
              });
          });
        },
        
        
        /**
         * @ngdoc function
         * @name newObject
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Makes a new object based on `gridOptions.importerNewObject`,
         * or based on an empty object if not present
         * @param {Grid} grid the grid we're importing into
         * @returns {object} the new object
         */
        newObject: function( grid ){
          if ( typeof(grid.options) !== "undefined" && typeof(grid.options.importerNewObject) !== "undefined" ){
            return new grid.options.importerNewObject();
          } else {
            return {};
          }
        },
        
        
        /**
         * @ngdoc function
         * @name alertError
         * @methodOf ui.grid.importer.service:uiGridImporterService
         * @description Provides an internationalised user alert for the failure,
         * and logs a console message including diagnostic content.
         * Optionally, if the the `gridOptions.importerErrorCallback` routine
         * is defined, then calls that instead, allowing user specified error routines
         * @param {Grid} grid the grid we're importing into
         * @param {array} headerRow the header row that we wish to match against
         * the column definitions
         */
        alertError: function( grid, alertI18nToken, consoleMessage, context ){
          if ( grid.options.importerErrorCallback ){
            grid.options.importerErrorCallback( grid, alertI18nToken, consoleMessage, context );
          } else {
            $window.alert(i18nService.getSafeText( alertI18nToken )); 
            $log.error(consoleMessage + context ); 
          }
        }
      };

      return service;

    }
  ]);

  /**
   *  @ngdoc directive
   *  @name ui.grid.importer.directive:uiGridImporter
   *  @element div
   *  @restrict A
   *
   *  @description Adds importer features to grid
   *
   */
  module.directive('uiGridImporter', ['$log', 'uiGridImporterConstants', 'uiGridImporterService', 'gridUtil', '$compile',
    function ($log, uiGridImporterConstants, uiGridImporterService, gridUtil, $compile) {
      return {
        replace: true,
        priority: 0,
        require: '^uiGrid',
        scope: false,
        link: function ($scope, $elm, $attrs, uiGridCtrl) {
          uiGridImporterService.initializeGrid(uiGridCtrl.grid);
        }
      };
    }
  ]);
  
  /**
   *  @ngdoc directive
   *  @name ui.grid.importer.directive:uiGridImporterMenuItem
   *  @element div
   *  @restrict A
   *
   *  @description Handles the processing from the importer menu item - once a file is
   *  selected
   *
   */
  module.directive('uiGridImporterMenuItem', ['$log', 'uiGridImporterConstants', 'uiGridImporterService', 'gridUtil', '$compile',
    function ($log, uiGridImporterConstants, uiGridImporterService, gridUtil, $compile) {
      return {
        replace: true,
        priority: 0,
        require: '^uiGrid',
        scope: false,
        templateUrl: 'ui-grid/importerMenuItem',
        link: function ($scope, $elm, $attrs, uiGridCtrl) {
          var handleFileSelect = function( event ){
            if (event.srcElement.files.length === 1) {
              var fileObject = event.srcElement.files[0];
              uiGridImporterService.importThisFile( grid, fileObject );
              event.srcElement.form.reset();
            }
          };

          var fileChooser = $elm[0].querySelectorAll('.ui-grid-importer-file-chooser');
          var grid = uiGridCtrl.grid;
          
          if ( fileChooser.length !== 1 ){
            $log.error('Found > 1 or < 1 file choosers within the menu item, error, cannot continue');
          } else {
            fileChooser[0].addEventListener('change', handleFileSelect, false);  // TODO: why the false on the end?  Google  
          }
        }
      };
    }
  ]);  
})();