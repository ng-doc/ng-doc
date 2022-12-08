import { Component, OnInit } from '@angular/core';
import {NgDocApiListComponent} from '@ng-doc/app';

@Component({
  selector: 'ng-doc-demo',
  templateUrl: './demo.component.html',
  styleUrls: ['./demo.component.css']
})
export class DemoComponent implements OnInit {
	variable?: NgDocApiListComponent;

  constructor() { }

  ngOnInit(): void {
  }

}
